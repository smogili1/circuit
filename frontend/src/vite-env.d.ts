/// <reference types="vite/client" />

// Declare module for importing YAML files as raw strings
declare module '*.yaml?raw' {
  const content: string;
  export default content;
}
