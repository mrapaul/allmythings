// Test-only stub for `@expo/vector-icons`. The real package pulls in RN font
// loading at import time; Vite cannot parse it. Aliased via vitest config.
//
// Each icon family is rendered as a simple host string component by react-test-renderer.
// `glyphMap` is exposed as an empty record so `keyof typeof <Icon>.glyphMap`
// type lookups still resolve at compile time.

type IconStub = string & { glyphMap: Record<string, number> };

const makeIcon = (name: string): IconStub => {
  const fn = Object.assign(() => name, { glyphMap: {} as Record<string, number> });
  // The component is consumed two ways:
  //  - as a JSX type (`<Feather .../>`) — react-test-renderer accepts the
  //    function form below
  //  - as a value with `.glyphMap` for type lookups (no runtime read in the
  //    paths we exercise in tests).
  // Coerce to the IconStub type so callers compile.
  return fn as unknown as IconStub;
};

export const Feather = makeIcon('Feather');
export const Ionicons = makeIcon('Ionicons');
export const MaterialIcons = makeIcon('MaterialIcons');
export const MaterialCommunityIcons = makeIcon('MaterialCommunityIcons');
export const FontAwesome = makeIcon('FontAwesome');
export const Entypo = makeIcon('Entypo');
export const AntDesign = makeIcon('AntDesign');
