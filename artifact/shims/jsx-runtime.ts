// Build « artifact » : runtime JSX automatique réimplémenté sur le React
// global (le build UMD de React 18 n'expose pas react/jsx-runtime).

const R = (window as any).React;

export const Fragment = R.Fragment;

export function jsx(type: unknown, props: Record<string, unknown>, key?: unknown) {
  return R.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
