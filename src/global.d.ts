declare global {
  interface Window {
    changeGoogleTranslateLanguage?: (lang: string) => void;
  }
}

export {};
