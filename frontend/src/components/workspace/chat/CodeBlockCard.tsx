import { Check, Copy, Terminal } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../ui/Button'

export function CodeBlockCard() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-token-md border border-border bg-[#0F172A]">
      <div className="flex items-center justify-between border-b border-[#334155] bg-[#1E293B] px-3 py-1.5 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-2">
          <Terminal size={14} />
          <span>Python</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#94A3B8] hover:text-[#F8FAFC]"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} className="text-[#22C55E]" /> : <Copy size={12} />}
        </Button>
      </div>
      <div className="overflow-x-auto p-3 text-xs leading-loose">
        <pre className="text-[#F8FAFC]">
          <code>
            <span className="text-[#c678dd]">def</span> <span className="text-[#61afef]">analyze_data</span>(
            <span className="text-[#e06c75]">df</span>):{'\n'}
            {'    '}
            <span className="text-[#5c6370]"># Placeholder logic for data analyzer</span>
            {'\n'}
            {'    '}
            <span className="text-[#c678dd]">return</span> <span className="text-[#e06c75]">df</span>.describe()
          </code>
        </pre>
      </div>
    </div>
  )
}
