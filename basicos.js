// Base de productos básicos: nombre, símbolo, subcategoría, unidad, dónde se guarda y
// días aproximados que aguanta desde la compra (sin abrir). Son orientativos: revisa siempre la etiqueta.
// [nombre, símbolo, subcategoría, unidad, conservación, días, sinónimos separados por |]
import { ESPECIAS } from './especias.js';
const N = 'nevera';
const P = 'despensa';
const C = 'congelador';
const RAW = [
  // Fruta
  ['Plátanos', '🍌', 'Fruta', 'ud', P, 5], ['Manzanas', '🍎', 'Fruta', 'ud', N, 21], ['Peras', '🍐', 'Fruta', 'ud', P, 7],
  ['Naranjas', '🍊', 'Fruta', 'ud', P, 14], ['Mandarinas', '🍊', 'Fruta', 'ud', P, 10], ['Limones', '🍋', 'Fruta', 'ud', N, 21],
  ['Fresas', '🍓', 'Fruta', 'ud', N, 3], ['Uvas', '🍇', 'Fruta', 'ud', N, 7], ['Kiwis', '🥝', 'Fruta', 'ud', N, 14],
  ['Melocotones', '🍑', 'Fruta', 'ud', P, 5], ['Cerezas', '🍒', 'Fruta', 'ud', N, 5], ['Melón', '🍈', 'Fruta', 'ud', P, 7],
  ['Sandía', '🍉', 'Fruta', 'ud', P, 7], ['Piña', '🍍', 'Fruta', 'ud', P, 5], ['Mango', '🥭', 'Fruta', 'ud', P, 5],
  ['Aguacates', '🥑', 'Fruta', 'ud', P, 5], ['Arándanos', '🫐', 'Fruta', 'ud', N, 7],
  // Verdura
  ['Brócoli', '🥦', 'Verdura', 'ud', N, 5], ['Coliflor', '🥦', 'Verdura', 'ud', N, 7], ['Lechuga', '🥬', 'Verdura', 'ud', N, 5],
  ['Espinacas frescas', '🥬', 'Verdura', 'ud', N, 4], ['Tomates', '🍅', 'Verdura', 'ud', P, 7], ['Cebollas', '🧅', 'Verdura', 'ud', P, 30],
  ['Ajo', '🧄', 'Verdura', 'ud', P, 60], ['Patatas', '🥔', 'Verdura', 'kg', P, 30], ['Boniatos', '🍠', 'Verdura', 'ud', P, 21],
  ['Zanahorias', '🥕', 'Verdura', 'ud', N, 21], ['Pimiento rojo', '🫑', 'Verdura', 'ud', N, 7], ['Pimiento verde', '🫑', 'Verdura', 'ud', N, 7],
  ['Calabacín', '🥒', 'Verdura', 'ud', N, 7], ['Pepino', '🥒', 'Verdura', 'ud', N, 7], ['Berenjena', '🍆', 'Verdura', 'ud', N, 7],
  ['Champiñones', '🍄', 'Verdura', 'ud', N, 5], ['Judías verdes', '🫘', 'Verdura', 'ud', N, 5], ['Puerros', '🥬', 'Verdura', 'ud', N, 10],
  ['Calabaza', '🎃', 'Verdura', 'ud', P, 30], ['Apio', '🥬', 'Verdura', 'ud', N, 14], ['Perejil', '🌿', 'Verdura', 'ud', N, 7],
  ['Maíz', '🌽', 'Verdura', 'ud', N, 5],
  // Carne
  ['Pechuga de pollo', '🍗', 'Carne', 'ud', N, 2], ['Muslos de pollo', '🍗', 'Carne', 'ud', N, 2], ['Carne picada', '🥩', 'Carne', 'ud', N, 1],
  ['Filetes de ternera', '🥩', 'Carne', 'ud', N, 3], ['Lomo de cerdo', '🥩', 'Carne', 'ud', N, 3], ['Costillas de cerdo', '🍖', 'Carne', 'ud', N, 3],
  ['Hamburguesas', '🍔', 'Carne', 'ud', N, 2], ['Salchichas', '🌭', 'Carne', 'ud', N, 7], ['Filetes de pavo', '🍗', 'Carne', 'ud', N, 3],
  // Pescado y marisco
  ['Salmón', '🐟', 'Pescado y marisco', 'ud', N, 2], ['Merluza', '🐟', 'Pescado y marisco', 'ud', N, 2], ['Bacalao', '🐟', 'Pescado y marisco', 'ud', N, 3],
  ['Dorada', '🐠', 'Pescado y marisco', 'ud', N, 2], ['Gambas', '🦐', 'Pescado y marisco', 'ud', N, 2], ['Mejillones', '🦪', 'Pescado y marisco', 'ud', N, 2],
  ['Calamares', '🦑', 'Pescado y marisco', 'ud', N, 2],
  // Embutidos
  ['Jamón serrano', '🥓', 'Embutidos', 'ud', N, 21], ['Jamón cocido', '🥓', 'Embutidos', 'ud', N, 7], ['Pavo en lonchas', '🥓', 'Embutidos', 'ud', N, 7],
  ['Chorizo', '🥓', 'Embutidos', 'ud', P, 60], ['Salchichón', '🥓', 'Embutidos', 'ud', P, 60], ['Bacon', '🥓', 'Embutidos', 'ud', N, 14],
  // Lácteos
  ['Leche', '🥛', 'Lácteos', 'ud', P, 90], ['Leche fresca', '🥛', 'Lácteos', 'ud', N, 7], ['Bebida de avena', '🥛', 'Lácteos', 'ud', P, 180],
  ['Yogur natural', '🥛', 'Lácteos', 'ud', N, 21], ['Yogur griego', '🥛', 'Lácteos', 'ud', N, 21], ['Mantequilla', '🧈', 'Lácteos', 'ud', N, 60],
  ['Nata para cocinar', '🥛', 'Lácteos', 'ud', P, 120], ['Kéfir', '🥛', 'Lácteos', 'ud', N, 21],
  // Quesos
  ['Queso curado', '🧀', 'Quesos', 'ud', N, 60], ['Queso tierno', '🧀', 'Quesos', 'ud', N, 21], ['Queso rallado', '🧀', 'Quesos', 'ud', N, 30],
  ['Mozzarella', '🧀', 'Quesos', 'ud', N, 14], ['Queso fresco', '🧀', 'Quesos', 'ud', N, 10], ['Queso en lonchas', '🧀', 'Quesos', 'ud', N, 21],
  // Huevos
  ['Huevos', '🥚', 'Huevos', 'ud', N, 28],
  // Pan y bollería
  ['Pan', '🥖', 'Pan y bollería', 'ud', P, 2], ['Pan de molde', '🍞', 'Pan y bollería', 'ud', P, 10], ['Pan integral', '🍞', 'Pan y bollería', 'ud', P, 5],
  ['Pan tostado', '🍞', 'Pan y bollería', 'ud', P, 120], ['Tortillas de trigo', '🫓', 'Pan y bollería', 'ud', P, 30], ['Pan rallado', '🍞', 'Pan y bollería', 'ud', P, 180],
  ['Magdalenas', '🧁', 'Pan y bollería', 'ud', P, 30], ['Croissants', '🥐', 'Pan y bollería', 'ud', P, 5],
  // Pasta y arroz
  ['Espaguetis', '🍝', 'Pasta y arroz', 'ud', P, 730], ['Macarrones', '🍝', 'Pasta y arroz', 'ud', P, 730], ['Fideos', '🍜', 'Pasta y arroz', 'ud', P, 730],
  ['Tallarines', '🍝', 'Pasta y arroz', 'ud', P, 730], ['Láminas de lasaña', '🍝', 'Pasta y arroz', 'ud', P, 730], ['Arroz redondo', '🍚', 'Pasta y arroz', 'ud', P, 730],
  ['Arroz basmati', '🍚', 'Pasta y arroz', 'ud', P, 730], ['Arroz integral', '🍚', 'Pasta y arroz', 'ud', P, 365], ['Cuscús', '🍚', 'Pasta y arroz', 'ud', P, 365],
  ['Quinoa', '🍚', 'Pasta y arroz', 'ud', P, 365],
  // Legumbres (secas)
  ['Lentejas', '🫘', 'Legumbres', 'ud', P, 730], ['Garbanzos', '🫘', 'Legumbres', 'ud', P, 730], ['Alubias', '🫘', 'Legumbres', 'ud', P, 730],
  // Conservas
  ['Atún en lata', '🥫', 'Conservas', 'ud', P, 1095], ['Sardinas en lata', '🥫', 'Conservas', 'ud', P, 1095], ['Tomate triturado', '🥫', 'Conservas', 'ud', P, 730],
  ['Garbanzos cocidos', '🥫', 'Conservas', 'ud', P, 1095], ['Lentejas cocidas', '🥫', 'Conservas', 'ud', P, 1095], ['Alubias cocidas', '🥫', 'Conservas', 'ud', P, 1095],
  ['Maíz dulce', '🌽', 'Conservas', 'ud', P, 1095], ['Aceitunas', '🫒', 'Conservas', 'ud', P, 730], ['Pimientos del piquillo', '🥫', 'Conservas', 'ud', P, 1095],
  ['Espárragos', '🥫', 'Conservas', 'ud', P, 1095], ['Mejillones en escabeche', '🥫', 'Conservas', 'ud', P, 1095], ['Champiñones laminados', '🥫', 'Conservas', 'ud', P, 1095],
  // Cereales y desayuno
  ['Cereales', '🥣', 'Cereales y desayuno', 'ud', P, 180], ['Copos de avena', '🥣', 'Cereales y desayuno', 'ud', P, 365], ['Muesli', '🥣', 'Cereales y desayuno', 'ud', P, 180],
  ['Cacao en polvo', '🍫', 'Cereales y desayuno', 'ud', P, 365], ['Mermelada', '🍓', 'Cereales y desayuno', 'ud', P, 365], ['Miel', '🍯', 'Cereales y desayuno', 'ud', P, 730],
  ['Galletas', '🍪', 'Cereales y desayuno', 'ud', P, 180],
  // Harinas y repostería
  ['Harina de trigo', '🌾', 'Harinas y repostería', 'ud', P, 365], ['Azúcar', '🍬', 'Harinas y repostería', 'ud', P, 1095], ['Levadura', '🌾', 'Harinas y repostería', 'ud', P, 365],
  ['Maicena', '🌾', 'Harinas y repostería', 'ud', P, 730], ['Chocolate para fundir', '🍫', 'Harinas y repostería', 'ud', P, 365],
  // Aceites y vinagres
  ['Aceite de oliva', '🫒', 'Aceites y vinagres', 'ud', P, 540, 'aceite'], ['Aceite de girasol', '🌻', 'Aceites y vinagres', 'ud', P, 365], ['Vinagre', '🍶', 'Aceites y vinagres', 'ud', P, 1095],
  // Especias y condimentos
  ['Sal', '🧂', 'Especias y condimentos', 'ud', P, 1825], ['Pimienta negra molida', '⚫', 'Chiles y pimientas', 'ud', P, 730, 'pimienta negra|pimienta'], ['Pimentón dulce', '🌶️', 'Especias y condimentos', 'ud', P, 365],
  ['Comino molido', '🌱', 'Especias y condimentos', 'ud', P, 730, 'comino|cumin'], ['Orégano', '🌿', 'Hierbas secas', 'ud', P, 365, 'oregano'], ['Canela molida', '🪵', 'Especias y condimentos', 'ud', P, 730, 'canela|cinnamon'],
  ['Laurel', '🍃', 'Hierbas secas', 'ud', P, 365, 'hojas de laurel'], ['Ajo en polvo', '🧄', 'Especias y condimentos', 'ud', P, 730], ['Curry en polvo', '🍛', 'Mezclas de especias', 'ud', P, 540, 'curry|curri'],
  ['Caldo en pastillas', '🧂', 'Caldos y fondos', 'ud', P, 730, 'avecrem|pastillas de caldo'], ['Caldo de pollo', '🍲', 'Caldos y fondos', 'ud', P, 365],
  // Salsas
  ['Tomate frito', '🍅', 'Salsas', 'ud', P, 365], ['Mayonesa', '🫙', 'Salsas', 'ud', P, 180], ['Ketchup', '🍅', 'Salsas', 'ud', P, 180],
  ['Mostaza', '🫙', 'Salsas', 'ud', P, 365], ['Salsa de soja', '🥢', 'Salsas asiáticas', 'ud', P, 730, 'soja|soy sauce|shoyu'], ['Pesto', '🌿', 'Salsas', 'ud', N, 90],
  // Café e infusiones
  ['Café molido', '☕', 'Café e infusiones', 'ud', P, 365], ['Café en cápsulas', '☕', 'Café e infusiones', 'ud', P, 365], ['Té', '🍵', 'Café e infusiones', 'ud', P, 730],
  ['Manzanilla', '🍵', 'Café e infusiones', 'ud', P, 730],
  // Dulces y snacks
  ['Chocolate', '🍫', 'Dulces y snacks', 'ud', P, 365], ['Patatas fritas', '🥔', 'Dulces y snacks', 'ud', P, 120], ['Palomitas', '🍿', 'Dulces y snacks', 'ud', P, 180],
  // Frutos secos
  ['Almendras', '🥜', 'Frutos secos', 'ud', P, 365], ['Nueces', '🌰', 'Frutos secos', 'ud', P, 180], ['Cacahuetes', '🥜', 'Frutos secos', 'ud', P, 180],
  ['Pipas', '🌻', 'Frutos secos', 'ud', P, 180], ['Pasas', '🍇', 'Frutos secos', 'ud', P, 365],
  // Bebidas
  ['Agua', '💧', 'Bebidas', 'ud', P, 365], ['Zumo', '🧃', 'Bebidas', 'ud', P, 180], ['Refrescos', '🥤', 'Bebidas', 'ud', P, 270],
  ['Cerveza', '🍺', 'Bebidas', 'ud', P, 180], ['Vino', '🍷', 'Bebidas', 'ud', P, 730],
  // Congelados
  ['Guisantes congelados', '🧊', 'Congelados', 'ud', C, 365], ['Verduras para salteado', '🧊', 'Congelados', 'ud', C, 365], ['Espinacas congeladas', '🧊', 'Congelados', 'ud', C, 365],
  ['Pizza congelada', '🍕', 'Congelados', 'ud', C, 180], ['Croquetas congeladas', '🧊', 'Congelados', 'ud', C, 180], ['Gambas congeladas', '🦐', 'Congelados', 'ud', C, 180],
  ['Merluza congelada', '🐟', 'Congelados', 'ud', C, 180], ['Helado', '🍦', 'Congelados', 'ud', C, 180], ['Patatas congeladas', '🍟', 'Congelados', 'ud', C, 365],
  // Platos preparados
  ['Gazpacho', '🍅', 'Platos preparados', 'ud', N, 30], ['Hummus', '🫘', 'Platos preparados', 'ud', N, 10], ['Tortilla de patatas', '🍳', 'Platos preparados', 'ud', N, 5],
];

export const BASICOS = [...RAW, ...ESPECIAS].map(([name, symbol, sub, unit, storage, days, aliases]) => ({
  name, symbol, sub, unit, storage, days, aliases: aliases ? aliases.split('|') : [],
  pack: ESPECIAS.some((e) => e[0] === name) ? 'especias' : 'basicos',
}));
export const STORAGE_NAMES = { despensa: 'Despensa', nevera: 'Nevera', congelador: 'Congelador' };
