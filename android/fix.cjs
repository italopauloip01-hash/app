const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\\`/g, '`');
    content = content.replace(/\\\$/g, '$');
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${filePath}`);
}

fixFile('../src/components/DebtStatementModal.tsx');
fixFile('../src/components/ReceiptModal.tsx');
