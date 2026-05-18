function escapeEancom(str) {
  if (!str) return str;
  // In EANCOM, ? is the escape character.
  // We need to escape ' (segment terminator), + (segment separator), : (component separator), and ? (escape char)
  return str.replace(/[?+:'"]/g, match => '?' + match);
}

const test1 = "Le prix a été négocié avec l'acheteur";
console.log("Original:", test1);
console.log("Escaped:", escapeEancom(test1));

const test2 = "10+20:30?40'50\"";
console.log("Original:", test2);
console.log("Escaped:", escapeEancom(test2));

