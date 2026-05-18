import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useTranslation } from "@/contexts/TranslationContext";
import { Globe } from "lucide-react";
import { Button } from "../ui/button";

export const LanguageSelector = () => {
  const { language, setLanguage } = useTranslation();

  const languages = [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" },
    { code: "ar", label: "العربية",  flag: "🇹🇳" },
  ];

  const handleLanguageChange = (lang: "fr" | "en" | "ar") => {
    setLanguage(lang);

    // RTL / LTR
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;

    // Trigger Google Translate for ALL page content
    const tryTranslate = (attempts = 0) => {
      const select = document.querySelector(".goog-te-combo") as HTMLSelectElement;
      if (select) {
        select.value = lang;
        select.dispatchEvent(new Event("change"));
      } else if (attempts < 10) {
        setTimeout(() => tryTranslate(attempts + 1), 200);
      }
    };
    tryTranslate();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Change language">
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code as "fr" | "en" | "ar")}
            className={`flex items-center gap-2 cursor-pointer ${
              language === lang.code ? "bg-accent font-semibold" : ""
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
            {language === lang.code && (
              <span className="ml-auto text-xs text-green-600">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
