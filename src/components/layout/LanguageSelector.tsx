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
  const { language, setLanguage, t } = useTranslation();

  const languages = [
    { code: "fr" as const, label: t("Français"), flag: "🇫🇷" },
    { code: "en" as const, label: t("Anglais"), flag: "🇬🇧" },
    { code: "ar" as const, label: t("Arabe"), flag: "🇹🇳" },
  ];

  const handleLanguageChange = (lang: "fr" | "en" | "ar") => {
    setLanguage(lang);

  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t("Changer la langue")} aria-label={t("Changer la langue")}>
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
