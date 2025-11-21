/**
 * Semantic expansion configuration for object detection
 * Maps common object names to their synonyms and related terms
 * Used to expand detection results and identify related objects
 */

export interface SemanticExpansionConfig {
  [baseObject: string]: {
    synonyms: string[];
    relatedObjects: string[];
    category: string;
  };
}

export const SEMANTIC_EXPANSION_DATABASE: SemanticExpansionConfig = {
  // Seating & Furniture
  couch: {
    synonyms: ['sofa', 'divan', 'settee', 'davenport', 'sofa bed', 'couch bed'],
    relatedObjects: ['throw pillow', 'blanket', 'cushion', 'armrest'],
    category: 'furniture',
  },
  sofa: {
    synonyms: ['couch', 'settee', 'divan', 'davenport'],
    relatedObjects: ['pillow', 'blanket', 'cushion', 'throw', 'armrest'],
    category: 'furniture',
  },
  chair: {
    synonyms: ['seat', 'armchair', 'desk chair', 'office chair', 'recliner', 'lounger'],
    relatedObjects: ['seat cushion', 'backrest', 'armrest', 'footrest'],
    category: 'furniture',
  },
  bed: {
    synonyms: ['mattress', 'sleeping bed', 'double bed', 'single bed', 'queen bed', 'king bed'],
    relatedObjects: ['pillow', 'blanket', 'comforter', 'bedsheet', 'mattress'],
    category: 'furniture',
  },

  // Tables & Surfaces
  table: {
    synonyms: ['desk', 'coffee table', 'dining table', 'side table', 'nightstand', 'countertop'],
    relatedObjects: ['chair', 'lamp', 'decoration', 'tableware'],
    category: 'furniture',
  },
  desk: {
    synonyms: ['table', 'workspace', 'work surface', 'office desk'],
    relatedObjects: ['computer', 'keyboard', 'monitor', 'office chair', 'lamp'],
    category: 'furniture',
  },
  nightstand: {
    synonyms: ['night table', 'bedside table', 'side table'],
    relatedObjects: ['lamp', 'alarm clock', 'book'],
    category: 'furniture',
  },

  // Lighting
  lamp: {
    synonyms: ['light', 'table lamp', 'floor lamp', 'desk lamp', 'standing lamp'],
    relatedObjects: ['light bulb', 'shade', 'cord', 'base'],
    category: 'lighting',
  },
  chandelier: {
    synonyms: ['ceiling light', 'hanging light', 'pendant light', 'light fixture'],
    relatedObjects: ['light bulb', 'glass shade', 'ceiling', 'chain'],
    category: 'lighting',
  },
  ceiling_light: {
    synonyms: ['overhead light', 'ceiling fixture', 'recessed light', 'light'],
    relatedObjects: ['light bulb', 'ceiling', 'fixture'],
    category: 'lighting',
  },

  // Kitchen Appliances
  refrigerator: {
    synonyms: ['fridge', 'icebox', 'cooler', 'kitchen appliance'],
    relatedObjects: ['freezer', 'door', 'handle', 'shelf'],
    category: 'appliance',
  },
  stove: {
    synonyms: ['oven', 'range', 'cooktop', 'cooking appliance', 'stovetop'],
    relatedObjects: ['oven door', 'burner', 'pot', 'pan', 'hood'],
    category: 'appliance',
  },
  microwave: {
    synonyms: ['microwave oven', 'kitchen appliance'],
    relatedObjects: ['door', 'buttons', 'display', 'turntable'],
    category: 'appliance',
  },
  dishwasher: {
    synonyms: ['kitchen appliance', 'washing machine (dishes)'],
    relatedObjects: ['door', 'handle', 'controls'],
    category: 'appliance',
  },
  sink: {
    synonyms: ['kitchen sink', 'washbasin', 'basin'],
    relatedObjects: ['faucet', 'counter', 'cabinet', 'drain'],
    category: 'fixture',
  },

  // Bathroom Fixtures
  toilet: {
    synonyms: ['commode', 'water closet', 'bathroom fixture'],
    relatedObjects: ['toilet seat', 'tank', 'bowl'],
    category: 'fixture',
  },
  sink: {
    synonyms: ['washbasin', 'basin', 'bathroom sink', 'vanity sink'],
    relatedObjects: ['faucet', 'mirror', 'cabinet', 'counter'],
    category: 'fixture',
  },
  bathtub: {
    synonyms: ['bath', 'tub', 'bathing tub'],
    relatedObjects: ['shower head', 'curtain', 'tile', 'drain'],
    category: 'fixture',
  },
  shower: {
    synonyms: ['shower stall', 'shower enclosure', 'shower room'],
    relatedObjects: ['shower head', 'curtain', 'glass door', 'tile'],
    category: 'fixture',
  },
  mirror: {
    synonyms: ['bathroom mirror', 'wall mirror', 'reflection'],
    relatedObjects: ['frame', 'wall', 'light'],
    category: 'fixture',
  },

  // Storage
  cabinet: {
    synonyms: ['cupboard', 'storage cabinet', 'wardrobe', 'closet'],
    relatedObjects: ['door', 'shelf', 'handle', 'hinges'],
    category: 'storage',
  },
  shelf: {
    synonyms: ['bookshelf', 'wall shelf', 'shelving', 'rack'],
    relatedObjects: ['books', 'decoration', 'items', 'brackets'],
    category: 'storage',
  },
  closet: {
    synonyms: ['wardrobe', 'clothes closet', 'storage closet'],
    relatedObjects: ['door', 'rod', 'shelves', 'hangers'],
    category: 'storage',
  },
  drawer: {
    synonyms: ['dresser drawer', 'filing drawer', 'cabinet drawer'],
    relatedObjects: ['handle', 'knob', 'contents'],
    category: 'storage',
  },

  // Windows & Doors
  window: {
    synonyms: ['window pane', 'glass window', 'sliding window'],
    relatedObjects: ['curtain', 'blind', 'shade', 'frame', 'sill'],
    category: 'architectural',
  },
  door: {
    synonyms: ['entrance door', 'entry door', 'room door', 'doorway'],
    relatedObjects: ['door frame', 'handle', 'hinges', 'lock'],
    category: 'architectural',
  },
  curtain: {
    synonyms: ['drapery', 'drapes', 'window curtain', 'shade'],
    relatedObjects: ['rod', 'rings', 'window', 'tie-back'],
    category: 'decor',
  },

  // Walls & Flooring
  wall: {
    synonyms: ['partition', 'wall surface', 'room divider'],
    relatedObjects: ['paint', 'wallpaper', 'decoration', 'picture'],
    category: 'architectural',
  },
  floor: {
    synonyms: ['flooring', 'ground', 'base surface'],
    relatedObjects: ['rug', 'carpet', 'mat', 'tile'],
    category: 'architectural',
  },
  ceiling: {
    synonyms: ['roof interior', 'overhead surface', 'ceiling surface'],
    relatedObjects: ['light', 'fan', 'ventilation'],
    category: 'architectural',
  },

  // Decoration & Art
  picture: {
    synonyms: ['painting', 'artwork', 'print', 'photograph', 'poster'],
    relatedObjects: ['frame', 'wall', 'glass'],
    category: 'decor',
  },
  rug: {
    synonyms: ['carpet', 'mat', 'floor covering', 'throw rug'],
    relatedObjects: ['floor', 'padding', 'fringe'],
    category: 'decor',
  },
  plant: {
    synonyms: ['potted plant', 'houseplant', 'flower', 'vegetation'],
    relatedObjects: ['pot', 'soil', 'leaves', 'stem'],
    category: 'decor',
  },
  vase: {
    synonyms: ['flower vase', 'decorative vase', 'container'],
    relatedObjects: ['flowers', 'water', 'decoration'],
    category: 'decor',
  },

  // Technology
  television: {
    synonyms: ['TV', 'tv set', 'monitor', 'screen', 'display'],
    relatedObjects: ['remote', 'stand', 'cable', 'speaker'],
    category: 'electronics',
  },
  computer: {
    synonyms: ['PC', 'desktop computer', 'computer monitor', 'laptop'],
    relatedObjects: ['keyboard', 'mouse', 'monitor', 'screen'],
    category: 'electronics',
  },
  printer: {
    synonyms: ['office equipment', 'printing device'],
    relatedObjects: ['paper', 'ink cartridge', 'cables'],
    category: 'electronics',
  },

  // Textiles
  blanket: {
    synonyms: ['throw blanket', 'bed blanket', 'quilt', 'comforter'],
    relatedObjects: ['pillow', 'bed', 'fold'],
    category: 'textile',
  },
  pillow: {
    synonyms: ['cushion', 'throw pillow', 'decorative pillow'],
    relatedObjects: ['pillowcase', 'bed', 'couch'],
    category: 'textile',
  },
  towel: {
    synonyms: ['bath towel', 'hand towel', 'towel rack'],
    relatedObjects: ['rack', 'bathroom', 'hook'],
    category: 'textile',
  },

  // Kitchen Items
  bowl: {
    synonyms: ['mixing bowl', 'serving bowl', 'dish'],
    relatedObjects: ['spoon', 'ladle', 'contents'],
    category: 'kitchenware',
  },
  pot: {
    synonyms: ['cooking pot', 'pot pan', 'cookware'],
    relatedObjects: ['lid', 'handle', 'stove'],
    category: 'kitchenware',
  },
  pan: {
    synonyms: ['cooking pan', 'frying pan', 'cookware'],
    relatedObjects: ['lid', 'handle', 'stove'],
    category: 'kitchenware',
  },
  plate: {
    synonyms: ['dish', 'dinner plate', 'plate set'],
    relatedObjects: ['fork', 'knife', 'spoon', 'food'],
    category: 'kitchenware',
  },

  // Misc
  clock: {
    synonyms: ['wall clock', 'digital clock', 'alarm clock', 'timepiece'],
    relatedObjects: ['hands', 'numbers', 'face'],
    category: 'decor',
  },
  book: {
    synonyms: ['textbook', 'novel', 'publication'],
    relatedObjects: ['shelf', 'pages', 'cover'],
    category: 'decor',
  },
  chair_back: {
    synonyms: ['backrest', 'chair back'],
    relatedObjects: ['chair', 'seat'],
    category: 'furniture',
  },
};

/**
 * Get semantic expansion for an object
 * Returns synonyms and related objects
 */
export function getSemanticExpansion(
  objectName: string
): { synonyms: string[]; relatedObjects: string[] } | null {
  const normalized = objectName.toLowerCase().trim();

  // Direct match
  if (SEMANTIC_EXPANSION_DATABASE[normalized]) {
    const expansion = SEMANTIC_EXPANSION_DATABASE[normalized];
    return {
      synonyms: expansion.synonyms,
      relatedObjects: expansion.relatedObjects,
    };
  }

  // Try to find partial match
  for (const [key, value] of Object.entries(SEMANTIC_EXPANSION_DATABASE)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return {
        synonyms: value.synonyms,
        relatedObjects: value.relatedObjects,
      };
    }
    // Check if it's a synonym
    if (value.synonyms.some((syn) => syn.toLowerCase().includes(normalized))) {
      return {
        synonyms: value.synonyms,
        relatedObjects: value.relatedObjects,
      };
    }
  }

  return null;
}

/**
 * Get all expanded terms for an object (including synonyms and related)
 */
export function getExpandedTerms(objectName: string): string[] {
  const expansion = getSemanticExpansion(objectName);
  if (!expansion) {
    return [objectName];
  }

  return [
    objectName,
    ...expansion.synonyms,
    ...expansion.relatedObjects,
  ].filter((term, index, arr) => arr.indexOf(term) === index); // Remove duplicates
}

/**
 * Check if two objects are related through semantic expansion
 */
export function areObjectsRelated(object1: string, object2: string): boolean {
  const expansion = getSemanticExpansion(object1);
  if (!expansion) {
    return false;
  }

  const normalized2 = object2.toLowerCase().trim();
  return (
    expansion.synonyms.some((syn) => syn.toLowerCase() === normalized2) ||
    expansion.relatedObjects.some((rel) => rel.toLowerCase() === normalized2)
  );
}
