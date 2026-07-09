export type ColumnType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "function"
  | "email"
  | "currency";

export type ColumnColor =
  | "none"
  | "purple"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "cyan"
  | "gray";

export interface FunctionArgument {
  name: string;
  type: string;
  hasDefault: boolean;
  isOptional: boolean;
  isRest: boolean;
  complexity?: string;
  content?: string;
  // User-provided value for the argument. For array-like params (e.g., type "{}"), this can be a string[]
  value?: string | string[];
  // Single column reference (for scalar params)
  columnReference?: string;
  // Multiple column references (for array-like params)
  columnReferences?: string[];
}

export interface TypeScriptFunction {
  id: string;
  name: string;
  functionName: string;
  fileType: string;
  exportType: string;
  parameterCount: number;
  arguments: FunctionArgument[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastModified: Date;
  functionDependencies: string[]; // Names of functions called within this function
}

export interface ColumnNameHistoryEntry {
  oldName: string;
  newName: string;
  timestamp: string; // ISO string
}

export interface SheetColumn {
  id: string;
  docId?: string; // Firestore document ID (for metadata ops like reordering)
  columnName: string; // Human-readable column name
  columnNameHistory?: ColumnNameHistoryEntry[]; // History of column name changes
  dataType: ColumnType; // The data type of the column
  function?: string; // ID of the TypeScript function (only for function type)
  arguments?: FunctionArgument[]; // Arguments for the function (only for function type)
  compiledFunction?: (...args: any[]) => any; // Pre-compiled function implementation (injected at load time)
  includeInForms: boolean; // Whether to include this column in forms
  parentTab?: string; // Parent tab for organizing columns

  // Display and behavior properties
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  options?: string[]; // For select type columns
  loadOptions?: (context?: { formData?: any }) => Promise<string[]>; // Dynamic options loader for select type columns (can access formData for context-aware options)
  color?: ColumnColor; // Optional column color theme
  showColumn?: boolean; // Whether to show/hide this column in the grid (default: true)
  readOnly?: boolean; // Whether this column is locked from manual editing in the grid (default: false)
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: (value: any) => boolean | string;
  };
  order?: number; // Optional - injected by withOrder() helper from column-orders.ts
}

export interface SheetConfig {
  id: string;
  name: string;
  columns: SheetColumn[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface SheetData {
  id: string;
  [key: string]: any; // Dynamic column values
}

export interface ColumnSettingsModalProps {
  column: SheetColumn | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (column: SheetColumn) => void;
  onDelete?: (columnId: string) => void;
  availableFunctions?: TypeScriptFunction[]; // Available TS functions
}

export interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (column: Omit<SheetColumn, "id">) => void;
  existingColumns: SheetColumn[];
  availableFunctions?: TypeScriptFunction[]; // Available TS functions
}
