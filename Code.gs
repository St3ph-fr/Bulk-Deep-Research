// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific LANGUAGE governing permissions and
// limitations under the License.

// --- CONFIGURATION ---

// Please replace with your actual API key from Google AI Studio.
const apiKey = "";

// [Action Required] - The ID of your Google Sheet.
// 1. If this is your first time running the script, leave this EMPTY ("").
// 2. Run the 'performDeepResearch' function once. It will create a new Sheet and show you the ID.
// 3. Paste the new ID here between the quotes.
const SHEET_ID = "";

// Define the Gemini models to be used for different phases of the process.
// NOTE: Using standard model names. Your 'gemini-2.5-pro' and 'gemini-2.5-flash' may be custom.
const GEMINI_PRO_MODEL = "gemini-2.5-pro"; // Used for complex reasoning (planning and final report generation)
const GEMINI_FLASH_MODEL = "gemini-2.5-flash"; // Used for faster, tool-based execution (answering questions)

// Define a constant for the number of distinct research sub-questions to generate per query.
const NUM_SEARCH_QUERIES = 3;

// The LANGUAGE for the final report.
const LANGUAGE = "French"; 

/**
 * A generic prompt template for initiating deep research on any topic.
 */
const PROMPT_TEMPLATE = `
**Role:** Senior Research Strategist
**Goal:** Your primary goal is to break down the user's main query into a series of smaller, manageable sub-questions that will collectively lead to a comprehensive answer.
**Date:** {{NOW}}
**LANGUAGE for final output:** {{lang}}

**User's Main Query:** "{{user_query}}"

**Instructions:**
1.  Carefully analyze the user's main query.
2.  Develop exactly {{NUM_QUESTIONS}} distinct sub-questions that are essential for building a complete and well-rounded answer.
3.  These sub-questions should be logical, specific, and designed to be answered using web research.
4.  Use the 'draftQuestions' tool to output the list of these sub-questions. Do NOT answer the questions yourself in this initial planning phase.
`;


// --- SCRIPT ---

/**
 * Main orchestrator function.
 * If SHEET_ID is not set, it creates a new sheet and prompts the user.
 * If SHEET_ID is set, it reads queries from the sheet, performs research for each,
 * and writes the output URL back to the sheet.
 */
function performDeepResearch() {
  // --- INITIAL SETUP ---
  
  // If the SHEET_ID is not configured, create a new sheet and guide the user.
  if (!SHEET_ID) {
    setupNewSheetAndExit();
    return; // Stop the execution
  }

  // --- PROCESSING QUERIES FROM THE SHEET ---

  let sheet;
  try {
    sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  } catch (e) {
    console.log(`Error: Could not open Google Sheet with ID "${SHEET_ID}". Please check if the ID is correct and you have access.`);
    return;
  }

  // Get all search queries from column A, starting from the second row.
  
  const queryRange = sheet.getDataRange().getValues();
  queryRange.shift();
  const queries = queryRange.map(row => row[0]).filter(String); // Get values, flatten to 1D, and remove empty rows.

  if (queries.length === 0) {
    console.log("No queries found in the first column of the sheet. Please add queries starting from cell A2.");
    return;
  }

  console.log(`Found ${queries.length} queries to process.`);

  // Loop through each query found in the sheet.
  for (let i = 0; i < queries.length; i++) {
    const userQuery = queries[i];
    const currentRow = i + 2; // The current row number in the sheet (A2 is row 2)
    const currentDate = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    
    console.log(`\n🚀 STARTING DEEP RESEARCH for query in row ${currentRow}: "${userQuery}" 🚀`);

    // Construct the initial prompt using the generic template.
    const initialPrompt = PROMPT_TEMPLATE.replace('{{user_query}}', userQuery)
      .replace('{{lang}}', LANGUAGE)
      .replace('{{NUM_QUESTIONS}}', NUM_SEARCH_QUERIES)
      .replace('{{NOW}}', currentDate);

    // --- PHASE 1: Draft the research plan ---
    console.log("====== PHASE 1: DRAFTING PLAN with Gemini Pro ======");
    const plan = draftPlan(initialPrompt);
    if (!plan || !plan.questions || plan.questions.length === 0) {
      console.log("🛑 Failed to generate a research plan for this query. Skipp  ng.");
      sheet.getRange(currentRow, 2).setValue("Failed to generate plan");
      continue; // Move to the next query
    }
    console.log(`✅ Plan Drafted with ${plan.questions.length} sub-questions.`);

    // --- PHASE 2: Collect data by executing the plan ---
    console.log("\n====== PHASE 2: EXECUTING PLAN with Gemini Flash ======");
    const qaPairs = []; // Array to store question-answer pairs
    for (const question of plan.questions) {
      console.log(`❓ Answering sub-question: "${question}"`);
      const answer = getAnswerForQuestion(userQuery, question, LANGUAGE);
      qaPairs.push({ question: question, answer: answer });
      console.log(`💬 Answer found.`);
    }
    console.log("✅ All sub-questions have been answered.");

    // --- PHASE 3: Generate the final report ---
    console.log("\n====== PHASE 3: GENERATING FINAL REPORT with Gemini Pro ======");
    const finalReport = generateFinalReport(initialPrompt, qaPairs, LANGUAGE);
    console.log("✅ FINAL REPORT GENERATED.");

    // Create a new Google Doc with the final report content.
    const docTitle = `Deep Research - ${userQuery.substring(0, 50)}`;
    let blob = Utilities.newBlob(finalReport, 'text/x-markdown', 'UTF-8');
    const file = Drive.Files.create({"name":docTitle,"mimeType":"application/vnd.google-apps.document"},blob,{"fields": "webViewLink" })
    
    // Log the link to the new Google Doc and write it back to the sheet.
    console.log(`📄 View the final report here: ${file.webViewLink}`);
    sheet.getRange(currentRow, 2).setValue(file.webViewLink);
    console.log(`✨ PROCESS COMPLETE for row ${currentRow}. URL added to sheet. ✨`);
  }
}

/**
 * Creates a new Google Sheet, sets it up with headers, and prompts the user
 * with the new Sheet ID and instructions.
 */
function setupNewSheetAndExit() {
  console.log("SHEET_ID is not set. Creating a new Google Sheet.");
  
  // Create a new spreadsheet and get its ID.
  const newSpreadsheet = SpreadsheetApp.create("Deep Research Input Sheet");
  const newSheetId = newSpreadsheet.getId();
  
  // Prepare the headers in the new sheet.
  const sheet = newSpreadsheet.getSheets()[0];
  createSheetHeaders(sheet);
  
  // Formulate the instructions for the user.
  const message = `A new Google Sheet has been created for you.\n\n` +
                  `1. Please copy this new Sheet ID:\n\n${newSheetId}\n\n` +
                  `2. Paste it into the 'SHEET_ID' constant at the top of the script.\n` +
                  `3. Add your search queries in the first column of the new sheet (starting at cell A2).\n` +
                  `4. Run the script again.`;
                  
  console.log(message);
}


/**
 * Prepares the target spreadsheet by clearing it and adding header columns.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet object to be prepared.
 */
function createSheetHeaders(sheet) {
  sheet.clear(); // Clear all previous content from the sheet.
  // Set the header titles in the first row.
  const headers = [["User Search Query", "Final Google Doc URL"]];
  sheet.getRange(1, 1, 1, 2).setValues(headers).setFontWeight("bold");
  sheet.setColumnWidth(1, 500); // Set width for the query column.
  sheet.setColumnWidth(2, 400); // Set width for the URL column.
  SpreadsheetApp.flush(); // Apply all pending spreadsheet changes.
}

/**
 * PHASE 1: Calls the Gemini API to draft a research plan based on the initial prompt.
 * @param {string} prompt The initial prompt defining the research goal.
 * @return {object|null} An object containing an array of questions, e.g., { questions: ["q1", "q2"] }, or null on failure.
 */
function draftPlan(prompt) {
  const tools = [{
    functionDeclarations: [{
      name: "draftQuestions",
      description: "Draft all the questions that need to be answered to fulfill the user's request.",
      parameters: {
        type: "OBJECT",
        properties: {
          questions: {
            type: "ARRAY",
            description: "An array of strings, where each string is a question to be investigated.",
            items: { type: "STRING" }
          }
        },
        required: ["questions"]
      }
    }]
  }];

  const systemInstruction = "You are a research strategist. Your task is to break down the user's main query into a series of clear, answerable sub-questions. Use the draftQuestions function to output your plan.";
  const contents = [{
    role: "user",
    parts: [{ text: prompt }]
  }];

  const apiResponse = callGeminiApi(contents, tools, systemInstruction, GEMINI_PRO_MODEL, "ANY");
  
  if (!apiResponse || !apiResponse.candidates || !apiResponse.candidates[0].content.parts[0]) {
      console.log("Error: Invalid response from API during planning phase.");
      return null;
  }

  const responsePart = apiResponse.candidates[0].content.parts[0];
  if (responsePart.functionCall && responsePart.functionCall.name === 'draftQuestions') {
    return responsePart.functionCall.args;
  } else {
    console.log("Error: Model did not call the draftQuestions function as expected.");
    console.log(JSON.stringify(apiResponse));
    return null;
  }
}

/**
 * PHASE 2: Calls the Gemini API to answer a single sub-question using the Google Search tool.
 * @param {string} mainQuery The original user query for context.
 * @param {string} question The specific sub-question to answer.
 * @param {string} lang The LANGUAGE for the answer.
 * @return {string} The answer found by the model, or "No answer found."
 */
function getAnswerForQuestion(mainQuery, question, lang) {
    const currentDate = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    const tools = [{ "googleSearch": {} }];

    const systemInstruction = `You are a research assistant. Your task is to answer the user's sub-question using the Google Search tool. Provide a concise and factual answer in ${lang}. Current date is: ${currentDate}.`;
    const contents = [{
        role: "user",
        parts: [{ text: `In the context of the main research topic "${mainQuery}", please answer the following sub-question: "${question}"` }]
    }];

    const apiResponse = callGeminiApi(contents, tools, systemInstruction, GEMINI_FLASH_MODEL, "NONE");

    if (apiResponse && apiResponse.candidates && apiResponse.candidates[0].content.parts[0].text) {
        return apiResponse.candidates[0].content.parts[0].text;
    }

    console.log("Warning: Could not get a definitive answer for the question.");
    return "No answer found.";
}

/**
 * PHASE 3: Calls Gemini Pro to generate the final, consolidated report.
 * @param {string} initialPrompt The original prompt that set the research goal.
 * @param {Array<Object>} qaPairs An array of {question, answer} objects.
 * @param {string} lang The LANGUAGE for the final report.
 * @return {string} The final generated report in text format.
 */
function generateFinalReport(initialPrompt, qaPairs, lang) {
  let collectedData = "Collected Data (Sub-Questions and Answers):\n\n";
  qaPairs.forEach((pair, index) => {
    collectedData += `Sub-Question ${index + 1}: ${pair.question}\nAnswer ${index + 1}: ${pair.answer}\n\n`;
  });

  const finalPrompt = `Your final task is to generate a comprehensive report based on the original user request and the collected data.

**Original Request:**
${initialPrompt}

---

**Collected Data:**
${collectedData}

---

Please synthesize all this information into a single, well-structured report that directly answers the user's original query. The final report must be written in ${lang}. Do not use any tools. Generate the text report directly.`;

  const contents = [{ role: "user", parts: [{ text: finalPrompt }] }];
  const systemInstruction = `You are a senior editor. Your task is to synthesize the provided research into a high-quality, comprehensive, and well-structured report in ${lang} that fully answers the user's original question.`;

  const apiResponse = callGeminiApi(contents, null, systemInstruction, GEMINI_PRO_MODEL, "NONE");

  if (apiResponse && apiResponse.candidates && apiResponse.candidates[0].content.parts[0].text) {
    return apiResponse.candidates[0].content.parts[0].text;
  } else {
    console.log("Error: Failed to generate the final report.");
    console.log(JSON.stringify(apiResponse));
    return "Failed to generate report.";
  }
}

/**
 * Helper function to call the Gemini API via Google's REST endpoint.
 * Includes retry logic with exponential backoff for robustness.
 * @param {Array<Object>} contents The conversation history.
 * @param {Array<Object>} tools The tools available to the model.
 * @param {string} systemInstruction The system prompt.
 * @param {string} modelName The name of the model to use.
 * @param {string} toolMode The tool calling mode (e.g., "AUTO", "ANY", "NONE").
 * @return {object|null} The JSON response from the API or null if it fails.
 */
function callGeminiApi(contents, tools, systemInstruction, modelName, toolMode) {
  const MAX_RETRIES = 3;
  const url = `https://generativeLANGUAGE.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    "contents": contents,
    "generationConfig": { "temperature": 0.5 }
  };

  if (systemInstruction) {
    payload.systemInstruction = { "parts": [{ "text": systemInstruction }] };
  }
  if (tools) {
    payload.tools = tools;
  }
  if (toolMode && toolMode !== 'NONE') {
    payload.toolConfig = { "functionCallingConfig": { "mode": toolMode } };
  }

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    console.log(`Calling Gemini API for model ${modelName} (Attempt ${attempt + 1}/${MAX_RETRIES})...`);
    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (responseCode === 200) {
        console.log("API call successful.");
        return JSON.parse(responseText);
      } else {
        console.log(`API Error (Attempt ${attempt + 1}): HTTP ${responseCode}. Response: ${responseText}`);
        if (attempt + 1 < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Waiting for ${delay / 1000}s before retrying.`);
          Utilities.sleep(delay);
        }
      }
    } catch (e) {
      console.log(`Network error during API call (Attempt ${attempt + 1}): ${e.toString()}`);
       if (attempt + 1 < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Waiting for ${delay / 1000}s before retrying.`);
          Utilities.sleep(delay);
       }
    }
  }

  console.log(`Failed to call Gemini API for model ${modelName} after ${MAX_RETRIES} attempts.`);
  return null; // Return null on failure
}

