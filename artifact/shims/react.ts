// Build « artifact » uniquement : React est chargé depuis cdnjs (UMD, global
// window.React) au lieu d'être embarqué dans le bundle.

const R = (window as any).React;

export default R;
export const {
  Fragment,
  StrictMode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} = R;
