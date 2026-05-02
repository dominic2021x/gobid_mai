/**
 * Câmpuri specifice imobiliare – aliniate cu filtrele de pe /ro
 * Folosit la: adăugare produse (user, executor, lichidator, admin)
 * Cheile trebuie să corespundă cu custom_fields pentru ca filtrele să funcționeze.
 */

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
};

/** Câmpuri pentru Apartamente – compatibile cu filtrele /ro (rooms, surface, floor, buildingYear) */
export const APARTAMENTE_FIELDS: FieldDef[] = [
  { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 3', min: 1, max: 10 },
  { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0, step: 0.01 },
  { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Ultimul etaj'] },
  { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1800, max: new Date().getFullYear() },
];

/** Câmpuri pentru Case și vile – compatibile cu filtrele /ro */
export const CASE_VILE_FIELDS: FieldDef[] = [
  { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 5', min: 1, max: 20 },
  { key: 'suprafata', label: 'Suprafață construită (mp)', type: 'number', required: false, placeholder: 'Ex: 150', min: 0, step: 0.01 },
  { key: 'suprafataTeren', label: 'Suprafață teren (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
  { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
  { key: 'gradina', label: 'Grădină', type: 'select', required: false, options: ['Da', 'Nu'] },
  { key: 'garaj', label: 'Garaj', type: 'select', required: false, options: ['Da', 'Nu'] },
  { key: 'piscina', label: 'Piscină', type: 'select', required: false, options: ['Da', 'Nu'] },
];

/** Câmpuri pentru Terenuri intravilane */
export const TERENURI_INTRAVILANE_FIELDS: FieldDef[] = [
  { key: 'suprafata', label: 'Suprafață (mp) *', type: 'number', required: true, placeholder: 'Ex: 500', min: 0, step: 0.01 },
  { key: 'tipTeren', label: 'Tip teren', type: 'select', required: false, options: ['Construcții', 'Parcelă', 'Comercial', 'Industrial', 'Servicii', 'Altele'] },
];

/** Câmpuri pentru Terenuri agricole */
export const TERENURI_AGRICOLE_FIELDS: FieldDef[] = [
  { key: 'suprafata', label: 'Suprafață (ha) *', type: 'number', required: true, placeholder: 'Ex: 5', min: 0, step: 0.01 },
  { key: 'tipTeren', label: 'Tip teren', type: 'select', required: false, options: ['Arabil', 'Livadă', 'Pădure', 'Pajiște', 'Mixt', 'Altele'] },
];

/** Câmpuri pentru Spații comerciale */
export const SPATII_COMERCIALE_FIELDS: FieldDef[] = [
  { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0, step: 0.01 },
  { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2010', min: 1800, max: new Date().getFullYear() },
];

/** Câmpuri pentru Hale industriale */
export const HALE_INDUSTRIALE_FIELDS: FieldDef[] = [
  { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
  { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
];

/** Câmpuri pentru Proprietăți turistice */
export const PROPRIETATI_TURISTICE_FIELDS: FieldDef[] = [
  { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 4', min: 1, max: 20 },
  { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 120', min: 0, step: 0.01 },
];

/** Mapare subcategorie (nume afișat sau key) -> câmpuri */
export const IMOBILIARE_SUBCATEGORY_FIELDS: Record<string, FieldDef[]> = {
  'exec-imobiliare': CASE_VILE_FIELDS,  // Executări Imobiliare – același set ca case (complet)
  'Apartamente': APARTAMENTE_FIELDS,
  'Case și Vile': CASE_VILE_FIELDS,
  'Case și vile': CASE_VILE_FIELDS,
  'Terenuri Intravilane': TERENURI_INTRAVILANE_FIELDS,
  'Terenuri intravilane': TERENURI_INTRAVILANE_FIELDS,
  'Terenuri Agricole': TERENURI_AGRICOLE_FIELDS,
  'Terenuri agricole': TERENURI_AGRICOLE_FIELDS,
  'Spații Comerciale': SPATII_COMERCIALE_FIELDS,
  'Spații comerciale': SPATII_COMERCIALE_FIELDS,
  'Hale Industriale': HALE_INDUSTRIALE_FIELDS,
  'Hale industriale': HALE_INDUSTRIALE_FIELDS,
  'Proprietăți Turistice': PROPRIETATI_TURISTICE_FIELDS,
  'Proprietăți turistice': PROPRIETATI_TURISTICE_FIELDS,
};

export function getImobiliareFieldsForSubcategory(subcategory: string): FieldDef[] {
  return IMOBILIARE_SUBCATEGORY_FIELDS[subcategory] ?? [];
}
