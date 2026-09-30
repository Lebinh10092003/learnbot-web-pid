export type PhysicalUnit = 'mm' | 'cm' | 'deg' | 'ms' | 'hz';

export interface SourceSpan {
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
}

export interface IrNode {
  span?: SourceSpan;
}

export interface SourceMetadata {
  language: 'cpp' | 'blockly';
  fileName?: string;
}

export interface IncludeNode extends IrNode {
  kind: 'include';
  path: string;
  system: boolean;
  raw?: string;
}

export type ValueType = 'void' | 'number' | 'boolean' | 'string';

export interface FunctionParameter extends IrNode {
  name: string;
  valueType: Exclude<ValueType, 'void'>;
  unit?: PhysicalUnit;
}

export interface NumberLiteralExpression extends IrNode {
  kind: 'numberLiteral';
  value: number;
  unit?: PhysicalUnit;
}

export interface StringLiteralExpression extends IrNode {
  kind: 'stringLiteral';
  value: string;
}

export interface BooleanLiteralExpression extends IrNode {
  kind: 'booleanLiteral';
  value: boolean;
}

export interface VariableExpression extends IrNode {
  kind: 'variable';
  name: string;
}

export type ArithmeticOperator = '+' | '-' | '*' | '/' | '%';

export interface ArithmeticExpression extends IrNode {
  kind: 'arithmetic';
  operator: ArithmeticOperator;
  left: Expression;
  right: Expression;
}

export interface BinaryExpression extends IrNode {
  kind: 'binary';
  operator: ArithmeticOperator;
  left: Expression;
  right: Expression;
}

export type ComparisonOperator = '<' | '<=' | '==' | '!=' | '>=' | '>';

export interface ComparisonExpression extends IrNode {
  kind: 'comparison';
  operator: ComparisonOperator;
  left: Expression;
  right: Expression;
}

export interface BooleanOperationExpression extends IrNode {
  kind: 'booleanOperation';
  operator: '&&' | '||';
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends IrNode {
  kind: 'unary';
  operator: '!' | '-' | '+';
  operand: Expression;
}

export interface SensorReadExpression extends IrNode {
  kind: 'sensorRead';
  sensor: 'ultrasonic' | 'irArray' | 'irLine';
  index?: Expression;
  unit?: Extract<PhysicalUnit, 'mm' | 'cm'>;
}

export interface TouchReadExpression extends IrNode {
  kind: 'touchRead';
  button?: Expression;
}

export interface CallExpression extends IrNode {
  kind: 'call';
  callee: string;
  arguments: Expression[];
}

export interface RawExpression extends IrNode {
  kind: 'rawExpression';
  code: string;
}

export type Expression =
  | NumberLiteralExpression
  | StringLiteralExpression
  | BooleanLiteralExpression
  | VariableExpression
  | ArithmeticExpression
  | BinaryExpression
  | ComparisonExpression
  | BooleanOperationExpression
  | UnaryExpression
  | SensorReadExpression
  | TouchReadExpression
  | CallExpression
  | RawExpression;

export interface MissionBeginStatement extends IrNode {
  kind: 'missionBegin';
  button: Expression;
}

export interface MissionEndStatement extends IrNode {
  kind: 'missionEnd';
}

export interface MotionStatement extends IrNode {
  kind: 'motion';
  motion: 'distance' | 'rotation';
  direction: 'forward' | 'backward' | 'left' | 'right';
  value: Expression;
  speed?: Expression;
  unit: Extract<PhysicalUnit, 'mm' | 'cm' | 'deg'>;
}

export interface WheelsStatement extends IrNode {
  kind: 'wheels';
  left: Expression;
  right: Expression;
  mode: 'pwm' | 'rpm';
}

export interface StopStatement extends IrNode {
  kind: 'stop';
}

export interface DelayStatement extends IrNode {
  kind: 'delay';
  duration: Expression;
}

export interface LedStatement extends IrNode {
  kind: 'led';
  led: Expression;
  color: Expression;
}

export interface GripperStatement extends IrNode {
  kind: 'gripper';
  action: 'open' | 'close' | 'moveTo' | 'moveToLR';
  arguments: Expression[];
}

export interface SoundStatement extends IrNode {
  kind: 'sound';
  frequency: Expression;
  duration: Expression;
}

export interface VariableDeclarationStatement extends IrNode {
  kind: 'variableDeclaration';
  name: string;
  valueType: Exclude<ValueType, 'void'>;
  initializer?: Expression;
}

export interface AssignmentStatement extends IrNode {
  kind: 'assignment';
  name: string;
  value: Expression;
}

export interface ChangeStatement extends IrNode {
  kind: 'change';
  name: string;
  operator: '+=' | '-=';
  value: Expression;
}

export interface IfStatement extends IrNode {
  kind: 'if';
  condition: Expression;
  then: Statement[];
  else?: Statement[];
}

export interface RepeatStatement extends IrNode {
  kind: 'repeat';
  count: Expression;
  body: Statement[];
}

export interface WhileStatement extends IrNode {
  kind: 'while';
  condition: Expression;
  body: Statement[];
}

export interface UntilStatement extends IrNode {
  kind: 'until';
  condition: Expression;
  body: Statement[];
}

export interface ForeverStatement extends IrNode {
  kind: 'forever';
  body: Statement[];
}

export interface FunctionCallStatement extends IrNode {
  kind: 'functionCall';
  name: string;
  arguments: Expression[];
}

export interface ReturnStatement extends IrNode {
  kind: 'return';
  value?: Expression;
}

export interface CommentStatement extends IrNode {
  kind: 'comment';
  text: string;
  style: 'line' | 'block';
}

export type RawScope = 'global' | 'setup' | 'loop' | 'function';

export interface RawStatement extends IrNode {
  kind: 'raw';
  code: string;
  scope: RawScope;
  locked?: boolean;
}

export interface Diagnostic {
  severity: 'info' | 'warning' | 'error';
  message: string;
  lineStart: number;
  lineEnd: number;
  code: 'raw-cpp' | 'unsupported' | 'syntax';
}

export interface ConversionResult {
  program: LeanbotProgram;
  diagnostics: Diagnostic[];
  status: 'full' | 'partial' | 'unsupported';
}

export interface FunctionDefinition extends IrNode {
  kind: 'functionDefinition';
  name: string;
  returnType: ValueType;
  parameters: FunctionParameter[];
  body: Statement[];
}

export type Statement =
  | MissionBeginStatement
  | MissionEndStatement
  | MotionStatement
  | WheelsStatement
  | StopStatement
  | DelayStatement
  | LedStatement
  | GripperStatement
  | SoundStatement
  | VariableDeclarationStatement
  | AssignmentStatement
  | ChangeStatement
  | IfStatement
  | RepeatStatement
  | WhileStatement
  | UntilStatement
  | ForeverStatement
  | FunctionCallStatement
  | FunctionDefinition
  | ReturnStatement
  | CommentStatement
  | RawStatement;

export type GlobalDeclaration =
  | VariableDeclarationStatement
  | CommentStatement
  | RawStatement;

export interface LeanbotProgram extends IrNode {
  includes: IncludeNode[];
  globals: GlobalDeclaration[];
  setup: Statement[];
  loop: Statement[];
  functions: FunctionDefinition[];
  source?: SourceMetadata;
}

export type WithoutSourceSpans<T> = T extends readonly (infer Item)[]
  ? WithoutSourceSpans<Item>[]
  : T extends object
    ? {
        [Key in keyof T as Key extends 'span' ? never : Key]: WithoutSourceSpans<T[Key]>;
      }
    : T;

export type NormalizedLeanbotProgram = WithoutSourceSpans<LeanbotProgram>;
