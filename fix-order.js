const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/operation-edi/Order.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add fieldErrors state after line 100
const afterCanAddArticle = `  const canAddArticle = selectedProduct !== null && isQtyValid && isPriceValid;`;
const withFieldErrors = `  const canAddArticle = selectedProduct !== null && isQtyValid && isPriceValid;

  // Field-level validation states
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: string}>({});`;

content = content.replace(afterCanAddArticle, withFieldErrors);

// 2. Update submitOrder function to add GLN validation
const oldSubmitStart = `  const submitOrder = async () => {
    // --- 1. Frontend Validation ---
    const errors: string[] = [];

    if (!numCommande.trim()) errors.push("Numéro de commande manquant");`;

const newSubmitStart = `  const submitOrder = async () => {
    // --- 1. Frontend Validation ---
    const errors: string[] = [];
    const newFieldErrors: {[key: string]: string} = {};

    // Validate Buyer GLN
    if (!currentGLN || currentGLN.trim() === "") {
      errors.push("GLN Acheteur manquant - Veuillez vous connecter avec un compte ayant un GLN valide");
      newFieldErrors.buyerGLN = "GLN Acheteur requis";
    }

    if (!numCommande.trim()) {
      errors.push("Numéro de commande manquant");
      newFieldErrors.numCommande = "Ce champ est obligatoire !";
    }`;

content = content.replace(oldSubmitStart, newSubmitStart);

// 3. Update supplier validation
const oldSupplierValidation = `    if (!selectedSupplier) errors.push("Fournisseur non sélectionné");
    else if (!selectedSupplier.gln) errors.push("Le fournisseur sélectionné n'a pas de GLN valide");

    if (articles.length === 0) errors.push("Aucun article dans la commande");`;

const newSupplierValidation = `    if (!selectedSupplier) {
      errors.push("Fournisseur non sélectionné");
      newFieldErrors.supplier = "Ce champ est obligatoire !";
    } else if (!selectedSupplier.gln) {
      errors.push("Le fournisseur sélectionné n'a pas de GLN valide");
      newFieldErrors.supplier = "GLN fournisseur invalide";
    }

    if (articles.length === 0) {
      errors.push("Aucun article dans la commande");
      newFieldErrors.articles = "Ajoutez au moins un article !";
    }`;

content = content.replace(oldSupplierValidation, newSupplierValidation);

// 4. Update error handling to set fieldErrors
const oldErrorHandling = `    if (errors.length > 0) {
      toast({
        title: "Validation échouée",
        description: (
          <ul className="list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        ),
        variant: "destructive",
      });
      return;
    }`;

const newErrorHandling = `    if (errors.length > 0) {
      setFieldErrors(newFieldErrors);
      toast({
        title: "Validation échouée",
        description: (
          <ul className="list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        ),
        variant: "destructive",
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Clear field errors if validation passes
    setFieldErrors({});`;

content = content.replace(oldErrorHandling, newErrorHandling);

// 5. Reset prefix and suffix on successful submit
const oldReset = `        setArticles([]);
        setNumCommande("");
        setSelectedSupplier(null);
        setProducts([]);
        setSelectedProduct(null);
        setQty("");
        setPrice("");
        generateOrderNumber();
        setDisplayMode("sent");`;

const newReset = `        setArticles([]);
        setNumCommande("");
        setSelectedSupplier(null);
        setProducts([]);
        setSelectedProduct(null);
        setQty("");
        setPrice("");
        setPrefix("");
        setSuffix("");
        generateOrderNumber();
        setDisplayMode("sent");`;

content = content.replace(oldReset, newReset);

// 6. Update addArticleWithPackaging to clear article error
const oldAddArticle = `    const articleStr = \`\${selectedProduct.gtin}!\${qty}!\${price}!\${packaging}\`;
    setArticles(prev => [...prev, articleStr]);
    setSelectedProduct(null);
    setQty("");
    setPrice("");
  };`;

const newAddArticle = `    const articleStr = \`\${selectedProduct.gtin}!\${qty}!\${price}!\${packaging}\`;
    setArticles(prev => [...prev, articleStr]);
    setSelectedProduct(null);
    setQty("");
    setPrice("");
    // Clear article error if exists
    if (fieldErrors.articles) {
      setFieldErrors(prev => {
        const newErrors = {...prev};
        delete newErrors.articles;
        return newErrors;
      });
    }
  };`;

content = content.replace(oldAddArticle, newAddArticle);

// Write the modified content back
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Order.tsx updated successfully!');
console.log('Changes applied:');
console.log('  - Added fieldErrors state');
console.log('  - Added GLN Acheteur validation');
console.log('  - Added field-level error tracking');
console.log('  - Added scroll to error on validation failure');
console.log('  - Reset prefix/suffix on successful submit');
