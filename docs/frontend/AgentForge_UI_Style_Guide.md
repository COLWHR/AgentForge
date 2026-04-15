# AgentForge UI Art Style & Design Guide (v1.0)

This comprehensive guide defines the visual identity, design patterns, and UI components of the AgentForge project. It is designed to be highly detailed for use in building a robust, high-end AI Agent creation and execution platform.

## 1. Design Philosophy
AgentForge follows a **"Modern Industrial & AI-Driven"** aesthetic.
- **Glassmorphism**: Subtle use of backdrop blurs (`backdrop-blur-xl`) and semi-transparent backgrounds to create depth.
- **Micro-Interactions**: Use of scale changes (`active:scale-95`) and hover translations (`hover:-translate-y-0.5`) to provide tactile feedback.
- **Dark-First Consistency**: A deep slate-based dark mode that emphasizes focus, professional developer tools, and agent execution monitoring.

## 2. Color Palette & Typography

### 2.1 Core Brand Colors
| Role | Color Value | Tailwind Equivalent | Hex Code |
| :--- | :--- | :--- | :--- |
| **Main Background** | Base page background | `slate-900` | `#0f172a` |
| **Surface (Primary)** | Cards, Sidebar, Modals | `slate-800` | `#1e293b` |
| **Surface (Translucent)** | Floating bars, Overlays | `slate-800/95` | - |
| **Accent (Action)** | Buttons, Active states | `indigo-600` | `#4f46e5` |
| **Accent (Subtle)** | Active nav item background | `indigo-500/10` | - |
| **Success** | Finish actions, Completed states | `emerald-600` | `#059669` |
| **Borders** | Component separators | `slate-700/50` | - |

### 2.2 Typography Specification
- **Font Stack**: `Inter` (Sans-serif) -> `system-ui` -> `Avenir`.
- **Text Styles**:
  - **Main Headings**: `text-2xl font-bold tracking-tight text-white`.
  - **Sub-headings**: `text-lg font-semibold text-slate-200`.
  - **Body Text**: `text-sm text-slate-400`.
  - **Metadata/Labels**: `text-xs font-medium uppercase tracking-wider text-slate-500`.

---

## 3. Component & Layout Patterns

### 3.1 Global Navigation (Sidebar)
- **Structure**: Fixed `w-64`, full height, `border-r border-slate-800`.
- **Logo**: 8x8 (`h-8 w-8`) `indigo-600` icon with `shadow-indigo-500/20`.
- **Nav Items**:
  - **Default**: `text-slate-400`, `hover:bg-slate-800`, `hover:text-slate-200`.
  - **Active**: `bg-indigo-500/10`, `text-indigo-400`, `ring-1 ring-indigo-500/20`, `rounded-xl`.

### 3.2 Workflow Stepper (LinearStepper)
- **Node Styling**: Circular nodes (`h-8 w-8`) with `border-2`.
- **State Indicators**:
  - **Active**: `border-indigo-600`, `ring-4 ring-indigo-900/20`.
  - **Completed**: `bg-indigo-600`, `text-white`, shows `CheckIcon`.
  - **Inactive**: `border-slate-600`, `opacity-60`, `cursor-not-allowed`.
- **Connector**: `border-dashed border-t-2` between nodes.

### 3.3 Floating Action Bar (BottomNavigationBar)
- **Design**: Floating detached bar at `bottom-8 right-8`.
- **Material**: `bg-slate-800/95`, `backdrop-blur-xl`, `border border-slate-700/60`, `shadow-2xl`.
- **Button Styling**: 
  - Primary: `bg-indigo-600`, `shadow-lg shadow-indigo-500/30`.
  - Secondary/Prev: `text-slate-300`, `hover:bg-slate-700`.

### 3.4 Toast & Error Feedback
- **Toast Positioning**: Fixed at `top-1/2 left-1/2 -translate-x-1/2` for critical errors, or `top-4 right-4` for general notifications.
- **Critical Error Toast**: `bg-red-500/10 border border-red-500/20 text-red-400 backdrop-blur-md rounded-lg px-4 py-3`.
- **General Info Toast**: `bg-slate-800/90 border border-slate-700/50 text-slate-200 backdrop-blur-md rounded-lg px-4 py-3`.
- **Interaction**: Auto-dismiss after 5s, with a manual close (X) button.

---

## 4. Iconography
- **Library**: `@heroicons/vue/24/outline` (for default states) and `solid` (for active/success states).
- **Key Icon Usage**:
  - **Dashboard / Agent Square**: `HomeIcon`
  - **Agents / Execution Logs**: `QueueListIcon`
  - **Skills / Tools**: `WrenchScrewdriverIcon`
  - **AI Actions**: `SparklesIcon`
  - **Sandbox / Code**: `CommandLineIcon`
  - **Navigation**: `ChevronRightIcon`, `ChevronLeftIcon`

---

## 5. Shadows & Elevations
| Level | Class / Specification | Usage |
| :--- | :--- | :--- |
| **Low** | `shadow-sm` | Default cards |
| **Medium** | `shadow-lg shadow-indigo-500/20` | Primary buttons, Active items |
| **High** | `shadow-2xl` | Floating bars, Modals |
| **Interactive** | `active:scale-95` | All primary buttons |

---

## 6. CSS Utility Classes (Tailwind Reference)
To replicate this style, use these common combinations:
- **Card**: `bg-slate-800/50 border border-slate-700/50 rounded-xl p-6`
- **Gradient Text**: `bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400`
- **Glass Bar**: `bg-slate-800/95 backdrop-blur-xl border border-slate-700/60`
