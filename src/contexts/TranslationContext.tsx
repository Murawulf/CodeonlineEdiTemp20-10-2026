// src/contexts/TranslationContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  const originalText = useRef(new WeakMap<Text, string>());
  const [language, setLanguageState] = useState<Language>(() => {
    const storedLanguage = localStorage.getItem("app-language");
    return storedLanguage === "en" || storedLanguage === "ar" || storedLanguage === "fr"
      ? storedLanguage
      : "fr";
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
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

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";

    const frenchDictionary = translations.fr;
    const shouldSkip = (node: Node) => {
      const element = node.parentElement;
      return !element || Boolean(element.closest(
        "input, textarea, script, style, [contenteditable='true'], [data-no-translate]"
      ));
    };

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (shouldSkip(node)) return;

        const textNode = node as Text;
        const source = originalText.current.get(textNode) ?? textNode.nodeValue ?? "";
        const key = source.trim();
        if (!key || !(key in frenchDictionary)) return;

        originalText.current.set(textNode, source);
        const translated = language === "fr" ? key : t(key);
        const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
        const trailingWhitespace = source.match(/\s*$/)?.[0] ?? "";
        textNode.nodeValue = `${leadingWhitespace}${translated}${trailingWhitespace}`;
        return;
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
