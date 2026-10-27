const s = "a😀z";
console.log(s.length,s.charCodeAt(1),s.charCodeAt(2),s.codePointAt(1),s.codePointAt(2));
console.log(s.at(-1),s.charAt(99),s.charCodeAt(99),s.codePointAt(99));
console.log(String.fromCharCode(-1,65536,65).charCodeAt(0),String.fromCharCode(65536).length);
console.log(String.fromCodePoint(65,128512),String.fromCodePoint(55296).charCodeAt(0));
console.log("😀".isWellFormed(),"\ud800x\udfff".isWellFormed());
console.log("\ud800x\udfff".toWellFormed(),"😀".toWellFormed());
try { String.fromCodePoint(1.1) } catch(e) {console.log(e.name)}
try { String.fromCodePoint(Infinity) } catch(e) {console.log(e.name)}
