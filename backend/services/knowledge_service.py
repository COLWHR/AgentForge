import re
import uuid
from io import BytesIO
from collections import Counter
from datetime import timezone
from typing import List
from zipfile import BadZipFile

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.orm import KnowledgeChunk, KnowledgeDocument
from backend.models.schemas import KnowledgeDocumentRead, KnowledgeSearchResult


class KnowledgeService:
    CHUNK_SIZE = 900
    CHUNK_OVERLAP = 120
    MAX_UPLOAD_BYTES = 100 * 1024 * 1024
    SEARCH_MIN_SCORE = 2.0
    SEARCH_MIN_UNIQUE_OVERLAP = 2
    SEARCH_MIN_SINGLE_OVERLAP_SCORE = 2.0
    SUPPORTED_UPLOAD_EXTENSIONS = {".pdf", ".docx"}
    SUPPORTED_UPLOAD_MIME_TYPES = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    SEARCH_STOPWORDS = {
        "a",
        "an",
        "and",
        "are",
        "do",
        "for",
        "how",
        "i",
        "is",
        "of",
        "or",
        "the",
        "to",
        "what",
        "你",
        "你们",
        "我",
        "我们",
        "他",
        "她",
        "它",
        "有",
        "是",
        "的",
        "了",
        "吗",
        "呢",
        "啊",
        "吧",
        "么",
        "什么",
        "怎么",
        "如何",
        "一下",
        "一个",
    }

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        tokens: list[str] = []
        for token in re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]+", text.lower()):
            tokens.append(token)
            if re.search(r"[\u4e00-\u9fff]", token):
                tokens.extend(list(token))
                tokens.extend(token[index : index + 2] for index in range(0, max(len(token) - 1, 0)))
        return tokens

    @staticmethod
    def _contains_cjk(token: str) -> bool:
        return re.search(r"[\u4e00-\u9fff]", token) is not None

    @classmethod
    def _is_informative_token(cls, token: str) -> bool:
        normalized = token.strip().lower()
        if not normalized or normalized in cls.SEARCH_STOPWORDS:
            return False
        if cls._contains_cjk(normalized) and len(normalized) <= 1:
            return False
        if not cls._contains_cjk(normalized) and len(normalized) <= 1:
            return False
        return True

    @classmethod
    def _filter_query_tokens(cls, tokens: list[str]) -> list[str]:
        return [token for token in tokens if cls._is_informative_token(token)]

    @staticmethod
    def _token_weight(token: str) -> float:
        length = len(token.strip())
        if KnowledgeService._contains_cjk(token) and length >= 2:
            return 2.0
        if length >= 6:
            return 3.0
        if length >= 3:
            return 2.0
        return 1.0

    @classmethod
    def _split_content(cls, content: str) -> list[str]:
        normalized = re.sub(r"\n{3,}", "\n\n", content.strip())
        if len(normalized) <= cls.CHUNK_SIZE:
            return [normalized]

        chunks: list[str] = []
        start = 0
        while start < len(normalized):
            end = min(start + cls.CHUNK_SIZE, len(normalized))
            chunk = normalized[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(normalized):
                break
            start = max(end - cls.CHUNK_OVERLAP, start + 1)
        return chunks

    @staticmethod
    def _as_iso(value: object) -> str:
        if hasattr(value, "astimezone"):
            return value.astimezone(timezone.utc).isoformat()  # type: ignore[union-attr]
        return ""

    async def create_document(
        self,
        db: AsyncSession,
        *,
        agent_id: uuid.UUID,
        team_id: uuid.UUID,
        title: str,
        content: str,
    ) -> KnowledgeDocumentRead:
        document = KnowledgeDocument(
            id=uuid.uuid4(),
            agent_id=agent_id,
            team_id=team_id,
            title=title.strip(),
            content=content.strip(),
        )
        db.add(document)
        await db.flush()

        chunks = self._split_content(document.content)
        for index, chunk in enumerate(chunks):
            token_text = " ".join(self._tokenize(f"{document.title}\n{chunk}"))
            db.add(
                KnowledgeChunk(
                    id=uuid.uuid4(),
                    document_id=document.id,
                    agent_id=agent_id,
                    team_id=team_id,
                    title=document.title,
                    content=chunk,
                    chunk_index=index,
                    token_text=token_text,
                )
            )
        await db.commit()
        await db.refresh(document)
        return self._read_model(document, chunk_count=len(chunks))

    @classmethod
    def extract_uploaded_content(cls, *, filename: str, content_type: str | None, data: bytes) -> tuple[str, str]:
        normalized_name = filename.strip()
        lowered_name = normalized_name.lower()
        extension = "." + lowered_name.rsplit(".", 1)[-1] if "." in lowered_name else ""
        if extension not in cls.SUPPORTED_UPLOAD_EXTENSIONS and (content_type or "") not in cls.SUPPORTED_UPLOAD_MIME_TYPES:
            raise ValueError("仅支持 PDF 或 Word（.docx）文件")
        if len(data) == 0:
            raise ValueError("上传文件为空")
        if len(data) > cls.MAX_UPLOAD_BYTES:
            raise ValueError("文件过大，请上传 100MB 以内的 PDF 或 Word 文件")

        if extension == ".pdf" or content_type == "application/pdf":
            return normalized_name, cls._extract_pdf_text(data)
        return normalized_name, cls._extract_docx_text(data)

    @staticmethod
    def _extract_pdf_text(data: bytes) -> str:
        try:
            from pypdf import PdfReader
        except Exception as exc:  # pragma: no cover - depends on runtime package installation
            raise RuntimeError("当前环境缺少 pypdf，无法解析 PDF") from exc

        try:
            reader = PdfReader(BytesIO(data))
            parts = [(page.extract_text() or "").strip() for page in reader.pages]
        except Exception as exc:
            raise ValueError("PDF 解析失败，请确认文件未加密且内容可复制") from exc
        text = "\n\n".join(part for part in parts if part)
        if not text.strip():
            raise ValueError("PDF 中未提取到可检索文本")
        return text

    @staticmethod
    def _extract_docx_text(data: bytes) -> str:
        try:
            from docx import Document
        except Exception as exc:  # pragma: no cover - depends on runtime package installation
            raise RuntimeError("当前环境缺少 python-docx，无法解析 Word 文件") from exc

        try:
            document = Document(BytesIO(data))
        except (BadZipFile, Exception) as exc:
            raise ValueError("Word 文件解析失败，请确认上传的是 .docx 文件") from exc
        paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
        table_cells = [
            cell.text.strip()
            for table in document.tables
            for row in table.rows
            for cell in row.cells
            if cell.text.strip()
        ]
        text = "\n".join([*paragraphs, *table_cells])
        if not text.strip():
            raise ValueError("Word 文件中未提取到可检索文本")
        return text

    async def list_documents(
        self,
        db: AsyncSession,
        *,
        agent_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> List[KnowledgeDocumentRead]:
        chunk_counts_subquery = (
            select(KnowledgeChunk.document_id, func.count(KnowledgeChunk.id).label("chunk_count"))
            .where(KnowledgeChunk.agent_id == agent_id, KnowledgeChunk.team_id == team_id)
            .group_by(KnowledgeChunk.document_id)
            .subquery()
        )
        stmt = (
            select(KnowledgeDocument, func.coalesce(chunk_counts_subquery.c.chunk_count, 0))
            .outerjoin(chunk_counts_subquery, KnowledgeDocument.id == chunk_counts_subquery.c.document_id)
            .where(KnowledgeDocument.agent_id == agent_id, KnowledgeDocument.team_id == team_id)
            .order_by(KnowledgeDocument.created_at.desc())
        )
        rows = await db.execute(stmt)
        return [self._read_model(document, chunk_count=int(chunk_count or 0)) for document, chunk_count in rows.all()]

    async def delete_document(
        self,
        db: AsyncSession,
        *,
        agent_id: uuid.UUID,
        team_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> bool:
        doc_stmt = select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.agent_id == agent_id,
            KnowledgeDocument.team_id == team_id,
        )
        document = (await db.execute(doc_stmt)).scalar_one_or_none()
        if document is None:
            return False
        await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))
        await db.delete(document)
        await db.commit()
        return True

    async def search(
        self,
        db: AsyncSession,
        *,
        agent_id: uuid.UUID,
        team_id: uuid.UUID,
        query: str,
        limit: int = 5,
    ) -> List[KnowledgeSearchResult]:
        normalized_query = query.strip().lower()
        query_tokens = self._filter_query_tokens(self._tokenize(query))
        if not query_tokens:
            return []
        query_counter = Counter(query_tokens)

        stmt = select(KnowledgeChunk).where(KnowledgeChunk.agent_id == agent_id, KnowledgeChunk.team_id == team_id)
        rows = await db.execute(stmt)
        scored: list[tuple[float, KnowledgeChunk]] = []
        for chunk in rows.scalars().all():
            chunk_counter = Counter((chunk.token_text or "").split())
            weighted_overlap = sum(
                min(count, chunk_counter.get(token, 0)) * self._token_weight(token) for token, count in query_counter.items()
            )
            unique_overlap = sum(1 for token in query_counter if chunk_counter.get(token, 0) > 0)
            phrase_bonus = 0.0
            if normalized_query and normalized_query in (chunk.title or "").lower():
                phrase_bonus += 2.0
            if normalized_query and normalized_query in chunk.content.lower():
                phrase_bonus += 2.0
            score = float(weighted_overlap + phrase_bonus)
            min_score = self.SEARCH_MIN_SCORE
            if phrase_bonus == 0 and unique_overlap < self.SEARCH_MIN_UNIQUE_OVERLAP:
                min_score = self.SEARCH_MIN_SINGLE_OVERLAP_SCORE
            if score < min_score:
                continue
            scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            KnowledgeSearchResult(
                document_id=chunk.document_id,
                chunk_id=chunk.id,
                title=chunk.title,
                content=chunk.content,
                score=score,
            )
            for score, chunk in scored[:limit]
        ]

    async def build_context(
        self,
        db: AsyncSession,
        *,
        agent_id: uuid.UUID,
        team_id: uuid.UUID,
        query: str,
        limit: int = 4,
    ) -> str:
        results = await self.search(db, agent_id=agent_id, team_id=team_id, query=query, limit=limit)
        if not results:
            return ""
        blocks = [
            f"[{index}] {item.title}\n{item.content}"
            for index, item in enumerate(results, start=1)
        ]
        return "\n\n".join(blocks)

    @staticmethod
    def _read_model(document: KnowledgeDocument, *, chunk_count: int) -> KnowledgeDocumentRead:
        return KnowledgeDocumentRead(
            id=document.id,
            agent_id=document.agent_id,
            title=document.title,
            content=document.content,
            chunk_count=chunk_count,
            created_at=KnowledgeService._as_iso(document.created_at),
            updated_at=KnowledgeService._as_iso(document.updated_at),
        )


knowledge_service = KnowledgeService()
