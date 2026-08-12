export interface GenericFigure {
  number: number;
  title: string;
  brief_description: string;
  reference_numerals: Record<string, string>;
  mermaid: string;
}

export interface GenericFiguresResult {
  figures: GenericFigure[];
  warnings?: string[];
}

export interface RegenerateGenericFigureResult {
  figure: GenericFigure;
  warnings?: string[];
}
