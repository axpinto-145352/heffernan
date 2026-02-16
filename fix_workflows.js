const fs = require('fs');
const path = require('path');

// ============================================================
// Utility: recursively walk all string values in an object and
// apply a transform function to each string value.
// ============================================================
function walkAndTransformStrings(obj, transformFn) {
  if (typeof obj === 'string') {
    return transformFn(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => walkAndTransformStrings(item, transformFn));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = walkAndTransformStrings(obj[key], transformFn);
    }
    return result;
  }
  return obj;
}

// ============================================================
// Apply a rename map to a workflow JSON object.
// renameMap: { oldName: newName, ... }
// ============================================================
function applyRenames(workflow, renameMap) {
  // Step 1: Replace all expression references $('OldName') -> $('NewName')
  // in ALL string values across ALL nodes.
  // We need to handle both single and double quote variants.
  function transformExpressions(str) {
    let result = str;
    for (const [oldName, newName] of Object.entries(renameMap)) {
      // Escape special regex chars in oldName
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace $('OldName') with $('NewName')
      result = result.replace(new RegExp("\\$\\('" + escaped + "'\\)", 'g'), "$('"+newName+"')");
      // Replace $("OldName") with $("NewName")
      result = result.replace(new RegExp('\\$\\("' + escaped + '"\\)', 'g'), '$("'+newName+'")');
    }
    return result;
  }

  // Apply expression transforms to all nodes
  workflow.nodes = workflow.nodes.map(node => {
    return walkAndTransformStrings(node, transformExpressions);
  });

  // Also apply to pinData if it exists
  if (workflow.pinData) {
    const newPinData = {};
    for (const [key, val] of Object.entries(workflow.pinData)) {
      const newKey = renameMap[key] || key;
      newPinData[newKey] = walkAndTransformStrings(val, transformExpressions);
    }
    workflow.pinData = newPinData;
  }

  // Step 2: Rename connection keys
  const newConnections = {};
  for (const [key, val] of Object.entries(workflow.connections)) {
    const newKey = renameMap[key] || key;
    newConnections[newKey] = val;
  }
  workflow.connections = newConnections;

  // Step 3: Rename node references inside connection targets
  for (const [key, connGroup] of Object.entries(workflow.connections)) {
    if (connGroup && connGroup.main) {
      for (const outputArr of connGroup.main) {
        if (Array.isArray(outputArr)) {
          for (const target of outputArr) {
            if (target && target.node && renameMap[target.node]) {
              target.node = renameMap[target.node];
            }
          }
        }
      }
    }
  }

  // Step 4: Rename node name properties
  for (const node of workflow.nodes) {
    if (renameMap[node.name]) {
      node.name = renameMap[node.name];
    }
  }

  return workflow;
}

// ============================================================
// MAIN
// ============================================================

// Read input files
const leadGenRaw = fs.readFileSync('/home/user/heffernan/Lead Gen System (4).json', 'utf8');
const rerunRaw = fs.readFileSync('/home/user/heffernan/Rerun EE Calculation.json', 'utf8');

let leadGen = JSON.parse(leadGenRaw);
let rerun = JSON.parse(rerunRaw);

// ============================================================
// LEAD GEN SYSTEM FIXES
// ============================================================

// Fix 1: Empty If node condition (id "20931c42-...")
{
  const node = leadGen.nodes.find(n => n.id === '20931c42-9c17-48d6-8a0d-5b5f2674c56e');
  if (!node) throw new Error('Cannot find If node 20931c42');
  node.parameters.conditions.conditions = [
    {
      "id": "204703a4-87bb-4b9d-b61e-f008180ce6f4",
      "leftValue": "={{ $('If5').item.json['Bureau Number'] }}",
      "rightValue": "",
      "operator": {
        "type": "string",
        "operation": "notEmpty",
        "singleValue": true
      }
    }
  ];
  // Name will be updated by the rename map below
}

// Fix 2: Empty If4 node condition (id "0d669554-...")
{
  const node = leadGen.nodes.find(n => n.id === '0d669554-fc2b-4a6c-86a5-83799a1213ef');
  if (!node) throw new Error('Cannot find If4 node 0d669554');
  node.parameters.conditions.conditions = [
    {
      "id": "204703a4-87bb-4b9d-b61e-f008180ce6f4",
      "leftValue": "={{ $('Loop Over Items2').item.json['Bureau Number'] }}",
      "rightValue": "",
      "operator": {
        "type": "string",
        "operation": "notEmpty",
        "singleValue": true
      }
    }
  ];
}

// Fix 3: Add retryOnFail to Perplexity nodes
const retryNodeIds = [
  '84355f83-9e61-45b4-9493-72e1062191d7', // Run EE calc
  '66e3ccb0-b35c-4686-af9e-6789df284a84', // Rev Calc
  '443aca7e-d012-4ade-b24e-eeb4397e583a', // Corrected Name
  'c37ea2da-1d1f-4b70-bafd-5f1db9f79b88', // Corrected Name1
];
for (const id of retryNodeIds) {
  const node = leadGen.nodes.find(n => n.id === id);
  if (!node) throw new Error('Cannot find retry node ' + id);
  node.retryOnFail = true;
  node.maxTries = 3;
  node.waitBetweenTries = 5000;
}

// Fix 5: Add error workflow settings
leadGen.settings.errorWorkflow = "";

// Fixes 4, 6, 7: Build the full rename map for Lead Gen
const leadGenRenameMap = {
  // Fix 4: If nodes
  "If": "Check EE Updated OK",
  "If1": "Filter Not Processing",
  "If2": "Is For-Profit Ready",
  "If3": "Filter Unsent FP Labels",
  "If4": "Check Revenue Updated OK",
  "If5": "Has Bureau No EE",
  "If6": "Filter Unprocessed Revenue",
  "If8": "Filter Not Done Revenue",
  "If9": "Filter Unprocessed EE",
  "If10": "Has No LI Profile",
  "If11": "Prospect Name Exists",
  "If12": "Filter Unsent NP Labels",
  "If13": "Is Non-Profit Ready",
  "If14": "Has Bureau Number",
  // Fix 6: Loop nodes
  "Loop Over Items": "EE Batch Loop",
  "Loop Over Items1": "Address Label FP Loop",
  "Loop Over Items2": "Revenue Batch Loop",
  "Loop Over Items3": "LI Profile Batch Loop",
  "Loop Over Items5": "Address Label NP Loop",
  "Loop Over Items6": "Doc Update FP Loop",
  "Loop Over Items7": "Doc Update NP Loop",
  // Fix 7: Other generic nodes
  "Merge": "Merge EE + Prompts",
  "Merge2": "Merge Revenue + Prompts",
  "Wait1": "Wait EE Cooldown",
  "Wait3": "Wait Revenue Cooldown",
  "Wait": "Wait NP Address Delay",
  "Prompts": "Fetch EE Prompts",
  "Prompts ": "Fetch Revenue Prompts",
  "Update Sources": "Update EE Sources",
  "Update Sources1": "Update Revenue Sources",
};

// Important: Fix 1's condition references $('If5') which should become $('Has Bureau No EE')
// Fix 2's condition references $('Loop Over Items2') which should become $('Revenue Batch Loop')
// These will be handled by the expression transform since the conditions were set before renaming.

applyRenames(leadGen, leadGenRenameMap);

// ============================================================
// RERUN EE CALCULATION FIXES
// ============================================================

// Fix A: Empty If node condition (id "685b6a27-...")
{
  const node = rerun.nodes.find(n => n.id === '685b6a27-4d9f-407b-b7e1-bc5f2cd0037f');
  if (!node) throw new Error('Cannot find Rerun If node 685b6a27');
  node.parameters.conditions.conditions = [
    {
      "id": "204703a4-87bb-4b9d-b61e-f008180ce6f4",
      "leftValue": "={{ $json.employee_count }}",
      "rightValue": "",
      "operator": {
        "type": "string",
        "operation": "notEmpty",
        "singleValue": true
      }
    }
  ];
}

// Fix B: Add retryOnFail to Find EE node (id starts with "5952bfa2")
{
  const node = rerun.nodes.find(n => n.id.startsWith('5952bfa2'));
  if (!node) throw new Error('Cannot find Find EE node 5952bfa2');
  node.retryOnFail = true;
  node.maxTries = 3;
  node.waitBetweenTries = 5000;
}

// Fix C: Remove useAppend from Update Sources (c9d3d420) and Update New Hire Sheet (0984c26f)
{
  const node1 = rerun.nodes.find(n => n.id.startsWith('c9d3d420'));
  if (!node1) throw new Error('Cannot find Update Sources c9d3d420');
  if (node1.parameters.options && node1.parameters.options.useAppend !== undefined) {
    delete node1.parameters.options.useAppend;
  }

  const node2 = rerun.nodes.find(n => n.id.startsWith('0984c26f'));
  if (!node2) throw new Error('Cannot find Update New Hire Sheet 0984c26f');
  if (node2.parameters.options && node2.parameters.options.useAppend !== undefined) {
    delete node2.parameters.options.useAppend;
  }
}

// Fix D: Rename generic nodes in Rerun
const rerunRenameMap = {
  "If": "Check EE Found",
  "If1": "Has Empty EE",
  "If6": "Has Bureau No Empty EE",
  "Loop Over Items": "EE Batch Loop",
  "Prompts": "Fetch EE Prompts",
};

applyRenames(rerun, rerunRenameMap);

// ============================================================
// Write output files
// ============================================================
fs.writeFileSync(
  '/home/user/heffernan/Lead Gen System (Fixed).json',
  JSON.stringify(leadGen, null, 2) + '\n',
  'utf8'
);

fs.writeFileSync(
  '/home/user/heffernan/Rerun EE Calculation (Fixed).json',
  JSON.stringify(rerun, null, 2) + '\n',
  'utf8'
);

console.log('Done. Output files written.');
console.log('  - /home/user/heffernan/Lead Gen System (Fixed).json');
console.log('  - /home/user/heffernan/Rerun EE Calculation (Fixed).json');
