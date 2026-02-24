import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Outlet } from "react-router-dom";
import { TopBarMenu } from "./TopBarMenu";
import logo from "../layout/logo.png"; // Adjust path if needed

interface Compte {
  id_compte: number;
  email: string;
  name: string;
  profile_id: number;
  permissions: {
    page_id: number;
    read: number;
    write: number;
    hide: number;
    page_name?: string;
  }[];
  certicode?: string | null;
  role?: string | null;
  is_suspended: number;
  created_at: string;
  id_entite: number;
  producer_name: string | null;
}

interface DashboardLayoutProps {
  currentUser: Compte | null;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ currentUser }) => {
  console.log('[DashboardLayout] 🏠 Component mounted');
  console.log('[DashboardLayout] 👤 Current user:', currentUser ? {
    id_compte: currentUser.id_compte,
    email: currentUser.email,
    name: currentUser.name,
    profile_id: currentUser.profile_id
  } : 'NULL');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showTos, setShowTos] = useState(false);
  const [lang, setLang] = useState<"fr" | "en" | "ar">("fr");

  const today = new Date().toLocaleDateString();

  const tosContent: Record<string, string> = {
    fr: `
Conditions Générales d’Utilisation (CGU)
Dernière mise à jour : ${today}

Bienvenue sur CodeonlineEdi, une plateforme développée et exploitée par Netconsulting Europe LTD.
L’accès et l’utilisation de ce service impliquent l’acceptation pleine et entière des présentes CGU.

1. Objet
CodeonlineEdi permet aux utilisateurs professionnels de gérer, échanger et consulter des données produits, catalogues électroniques et informations EDI de manière sécurisée.

2. Accès au service
- L’accès est réservé aux comptes autorisés par Netconsulting Europe LTD.
- Les identifiants sont personnels et confidentiels ; l’utilisateur est responsable de leur conservation.

3. Obligations de l’utilisateur
- Fournir des informations exactes, complètes et à jour.
- Ne pas utiliser la plateforme à des fins frauduleuses, abusives ou contraires à la législation.
- Respecter les droits de propriété intellectuelle et la confidentialité des données échangées.

4. Propriété intellectuelle
- Tous les éléments de CodeonlineEdi (code, interface, logos, documentation, bases de données) sont protégés par les droits d’auteur et restent la propriété exclusive de Netconsulting Europe LTD.
- Toute reproduction ou utilisation non autorisée est interdite.

5. Confidentialité & sécurité
- Les données traitées sur CodeonlineEdi sont strictement confidentielles.
- Netconsulting Europe LTD met en œuvre les meilleures pratiques de sécurité pour protéger les informations, sans garantir une sécurité absolue face aux risques numériques.

6. Limitation de responsabilité
- Netconsulting Europe LTD n’est pas responsable en cas de mauvaise utilisation du service par l’utilisateur.
- Le service est fourni “tel quel” sans garantie d’exhaustivité ou de disponibilité permanente.

7. Suspension & Résiliation
- Netconsulting Europe LTD peut suspendre ou résilier un compte en cas de non-respect des présentes CGU.
- L’utilisateur peut demander la suppression de son compte à tout moment.

8. Droit applicable
Les présentes CGU sont régies par le droit applicable au siège de Netconsulting Europe LTD. En cas de litige, les juridictions compétentes seront celles du ressort du siège social.

En cliquant sur “Accepter”, vous confirmez avoir lu, compris et accepté l’ensemble de ces conditions.
    `,
    en: `
Terms of Service (ToS)
Last update: ${today}

Welcome to CodeonlineEdi, a platform developed and operated by Netconsulting Europe LTD.
By accessing and using this service, you agree to the following Terms of Service.

1. Purpose
CodeonlineEdi provides professional users with a secure environment to manage, exchange, and consult product data, electronic catalogues, and EDI information.

2. Service Access
- Access is limited to accounts authorized by Netconsulting Europe LTD.
- Credentials are personal and confidential; users are responsible for their safekeeping.

3. User Responsibilities
- Provide accurate, complete, and up-to-date information.
- Not use the platform for fraudulent, abusive, or unlawful purposes.
- Respect intellectual property rights and the confidentiality of shared data.

4. Intellectual Property
- All elements of CodeonlineEdi (software, UI, logos, documentation, databases) are protected and remain the exclusive property of Netconsulting Europe LTD.
- Any unauthorized reproduction or use is prohibited.

5. Confidentiality & Security
- Data processed through CodeonlineEdi is strictly confidential.
- Netconsulting Europe LTD implements security best practices but does not guarantee absolute protection against cyber risks.

6. Limitation of Liability
- Netconsulting Europe LTD shall not be held responsible for misuse of the service by users.
- The service is provided “as is” without guarantee of completeness or permanent availability.

7. Suspension & Termination
- Netconsulting Europe LTD reserves the right to suspend or terminate accounts in case of violation of these ToS.
- Users may request deletion of their account at any time.

8. Governing Law
These ToS are governed by the law applicable at the registered office of Netconsulting Europe LTD. Jurisdiction lies with the competent courts of said location.

By clicking “Accept”, you confirm you have read, understood, and agreed to these Terms.
    `,
    ar: `
شروط الاستخدام
آخر تحديث: ${today}

مرحبًا بكم في CodeonlineEdi، وهي منصة تم تطويرها وتشغيلها بواسطة Netconsulting Europe LTD.
باستخدامكم لهذه الخدمة، فإنكم توافقون على شروط الاستخدام التالية:

1. الغرض
توفر منصة CodeonlineEdi بيئة آمنة للمستخدمين المهنيين لإدارة وتبادل واستشارة بيانات المنتجات والفهارس الإلكترونية ومعلومات EDI.

2. الوصول إلى الخدمة
- الوصول مخصص فقط للحسابات المصرح بها من قبل Netconsulting Europe LTD.
- بيانات الدخول شخصية وسرية؛ والمستخدم مسؤول عن الحفاظ عليها.

3. التزامات المستخدم
- تقديم معلومات دقيقة وكاملة ومحدثة.
- عدم استخدام المنصة لأغراض غير قانونية أو مسيئة أو احتيالية.
- احترام حقوق الملكية الفكرية والحفاظ على سرية البيانات المتبادلة.

4. الملكية الفكرية
- جميع عناصر CodeonlineEdi (البرمجيات، واجهة المستخدم، الشعارات، الوثائق، قواعد البيانات) محمية وتبقى ملكًا حصريًا لشركة Netconsulting Europe LTD.
- يحظر أي نسخ أو استخدام غير مصرح به.

5. السرية والأمان
- جميع البيانات المعالجة عبر CodeonlineEdi سرية تمامًا.
- تعتمد Netconsulting Europe LTD أفضل الممارسات الأمنية لكنها لا تضمن حماية مطلقة ضد المخاطر الإلكترونية.

6. حدود المسؤولية
- لا تتحمل Netconsulting Europe LTD المسؤولية عن أي سوء استخدام للخدمة من قبل المستخدمين.
- يتم توفير الخدمة "كما هي" دون ضمان التوافر الدائم أو الاكتمال.

7. التعليق والإنهاء
- تحتفظ Netconsulting Europe LTD بالحق في تعليق أو إنهاء الحسابات في حال انتهاك شروط الاستخدام.
- يمكن للمستخدم طلب حذف حسابه في أي وقت.

8. القانون الواجب التطبيق
تخضع هذه الشروط للقوانين السارية في مقر Netconsulting Europe LTD. وفي حال حدوث نزاع، تكون المحاكم المختصة هي المحاكم التابعة لذلك المقر.

بالضغط على "أوافق"، فإنك تؤكد أنك قد قرأت وفهمت ووافقت على جميع هذه الشروط.
    `,
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      {currentUser && <TopBarMenu compte={currentUser} />}
      <div className="flex flex-1">
        <Sidebar isSidebarOpen={isSidebarOpen} />
        <main
          className={`flex-1 p-6 transition-all duration-300 overflow-y-auto ${
            isSidebarOpen ? "md:ml-64" : "md:ml-0"
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="w-full border-t py-6">
        <div className="container mx-auto px-4 text-center">
          <img
            src={logo}
            alt="Netconsulting Europe"
            className="h-32 mx-auto mb-4"
          />
          <div className="text-xs text-muted-foreground -mt-1">
            Copyrights © 2014- {new Date().getFullYear()} Netconsulting Europe
            LTD — Tous droits réservés
          </div>
          <button
            onClick={() => setShowTos(true)}
            className="mt-2 text-blue-600 underline hover:text-blue-800"
          >
            {lang === "fr"
              ? "Conditions d’utilisation"
              : lang === "en"
              ? "Terms of Service"
              : "شروط الاستخدام"}
          </button>
        </div>
      </footer>

      {/* TOS Modal */}
      {showTos && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="p-4 flex justify-between items-center border-b">
            <h2 className="text-lg font-semibold">
              {lang === "fr"
                ? "Conditions d’utilisation"
                : lang === "en"
                ? "Terms of Service"
                : "شروط الاستخدام"}
            </h2>
            <div className="space-x-2">
              <button
                onClick={() => setLang("fr")}
                className={`px-3 py-1 rounded ${
                  lang === "fr" ? "bg-blue-600 text-white" : "bg-gray-200"
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1 rounded ${
                  lang === "en" ? "bg-blue-600 text-white" : "bg-gray-200"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("ar")}
                className={`px-3 py-1 rounded ${
                  lang === "ar" ? "bg-blue-600 text-white" : "bg-gray-200"
                }`}
              >
                AR
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 whitespace-pre-wrap leading-relaxed text-justify">
            {tosContent[lang]}
          </div>
          <div className="p-4 border-t text-center">
            <button
              onClick={() => setShowTos(false)}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              {lang === "fr" ? "Accepter" : lang === "en" ? "Accept" : "أوافق"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
