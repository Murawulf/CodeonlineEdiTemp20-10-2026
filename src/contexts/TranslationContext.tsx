// src/contexts/TranslationContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { translations } from "../pages/src/translations";

export type Language = "fr" | "en" | "ar";

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined
);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem("app-language") as Language) || "fr";
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
    document.documentElement.lang = lang;
  }, []);

  // ✅ SAFE TRANSLATE FUNCTION with fallback chain: lang → fr → key
  const t = useCallback(
    (key: string, fallback?: string): string => {
      if (!key) return "";

      const langDict = translations[language];
      const frDict = translations["fr"];

      if (langDict && key in langDict) return langDict[key];
      if (frDict && key in frDict) return frDict[key];

      return fallback ?? key;
    },
    [language]
  );

  // 🔥 AUTO DOM TRANSLATION (MutationObserver)
  useEffect(() => {
    const shouldSkip = (el: HTMLElement) => {
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SCRIPT" ||
        tag === "STYLE"
      );
    };

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();

        if (!text || text.length < 2) return;

        const parent = node.parentElement;
        if (!parent || shouldSkip(parent)) return;

        node.textContent = t(text);
      }

      node.childNodes.forEach(translateNode);
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          translateNode(node);
        });
      });
    });

    // initial pass
    translateNode(document.body);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language, t]);

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = (): TranslationContextType => {
  const ctx = useContext(TranslationContext);
  if (!ctx)
    throw new Error("useTranslation must be inside <TranslationProvider>");
  return ctx;
};
