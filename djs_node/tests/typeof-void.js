let effects = 0;
function effect() { effects = effects + 1; return {}; }
console.log(typeof missing, typeof (alsoMissing));
console.log(void {}, void effect(), effects);
