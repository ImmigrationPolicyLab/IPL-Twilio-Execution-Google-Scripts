function batchSurveyLanguageSupport() {
  Logger.log("batchSurvey called");
  var ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty("ACCOUNT_SID");
  var ACCOUNT_TOKEN = PropertiesService.getScriptProperties().getProperty("ACCOUNT_TOKEN");

  Logger.log("account", ACCOUNT_SID);

  // The name of the sheet where participant numbers are stored
  var sheetName = "executionsWithLanguage";

  // Set the batch size (the number of surveys to send in one batch)
  // Recommended: 20 surveys per batch, with 3 minute interval wait time
  var batchSize = 2;

  // Object that has flowId for each language
  var languageFlowData = getLanguageFlowData();

  // Options to send with the Twilio http request to start a survey execution
  var options = {
    "method" : "post",
    "headers": {
       "Authorization" : "Basic " + Utilities.base64Encode(ACCOUNT_SID + ":" + ACCOUNT_TOKEN)
    }
  };

  // Get data from the google sheet
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var totalDataRange = sheet.getDataRange();
  var values = sheet.getDataRange().getValues();

  // Get the starting row for the next batch
  var nextBatchStartRow = findNextBatchStart(totalDataRange, values, sheet);

  var numCols = values[0].length; // Set the total number of columns
  var endRow = nextBatchStartRow + batchSize; // Set the last row that will be evaluated as part of this batch

  // Iterate through numbers in batch and send a post request for numbers
  for (let r = 0; r <= batchSize; r++) {
    // If the row number is more than the total of rows in the table, delete the trigger
    if (nextBatchStartRow + r >= values.length ) {
        deleteTrigger();
    } else {
      /*---If the row number is within the table range, send the survey execution request---*/
      var numFromSheet = values[nextBatchStartRow + r][0];
      var language = values[nextBatchStartRow + r][1];

      options.payload = {
        "To": "whatsapp:+" + numFromSheet,
        "From": "whatsapp" + languageFlowData[language].number,
      }
      var url = "https://studio.twilio.com/v1/Flows/" + languageFlowData[language].flowId + "/Executions";
      var response = JSON.parse(UrlFetchApp.fetch(url,options));

      /*---Record the twilio response in the spread sheet---*/
      // Get start and end values for the range of cells to update
      var spreadStart = totalDataRange.getCell(nextBatchStartRow + r + 1, numCols - 4).getA1Notation();
      var spreadEnd = totalDataRange.getCell(nextBatchStartRow + r + 1, numCols).getA1Notation();

      // Store the values that will be added to table in an array (list)
      var responseData = [new Date(), response.status, response.sid, response.contact_channel_address, response.url]

      // Get the range for where the values will be set in the table
      var range = sheet.getRange(spreadStart + ":" + spreadEnd);

      // Set the values in the spreadsheet
      range.setValues([responseData]);
    }
  }

  // Write to the spread sheet where the next batch should start, or delete all triggers if all surveys have been sent
  handleEndOfBatch(nextBatchStartRow, batchSize, values, sheet, totalDataRange);
}

/* ---Helper functions for the batchSurveyLanguageSupport--- */

function getLanguageFlowData() {
 return {
   "EN": {
     flowId: "FLOW_SID_ID_EN",
     number: "+EN_FROM_NUMBER",
   },
   "ES": {
     flowId: "FLOW_SID_ID_ES",
     number: "+ES_FROM_NUMBER",
   },
    "FR": {
     flowId: "FLOW_SID_ID_FR",
     number: "+FR_FROM_NUMBER",
   },
 }
}

function findNextBatchStart(totalDataRange, values, sheet) {
  // Set default batch start to 1 for new survey session
  var nextBatchStartRow = 1;
  var row = 1;

  // Find the nextBatchStart, if one exists
  while(nextBatchStartRow == 1 && row < values.length) {
    if(values[row] && values[row][2] == "NextBatchStart") {
      var batchCell = totalDataRange.getCell(row + 1, 3).getA1Notation();
      sheet.getRange(batchCell).setValue("PreviousBatchStart");
      nextBatchStartRow = row;
    }
    row ++;
  }
  return nextBatchStartRow;
}

function handleEndOfBatch(nextBatchStartRow, batchSize, values, sheet, totalDataRange) {
  // If the end of the batch is within the range of values, mark the nextBatchStart
  if (nextBatchStartRow + batchSize + 1 < values.length) {

    /* ---Find the cell to update--- */
    // Row: Add the nextBatchStartRow, plus the batchSize, plus 2 to account for the index off by 1 value, and putting it on the next row
    // Column: Will always be the third column
    var cell = totalDataRange.getCell(nextBatchStartRow + batchSize + 2, 3).getA1Notation();
    sheet.getRange(cell).setValue("NextBatchStart");
  } else {
    // If the end of the batch is outside the range of values, cancel the trigger
    deleteTrigger();
  }
}


/* ---Function to automate sending batches of surveys--- */
function startSurveyBatchingWithLanguage() {
  Logger.log("startSurveyBatching called");

  // Set interval for the number of minutes to wait between each batch
  var interval = 1;

  // Trigger batch every [interval] minute
  ScriptApp.newTrigger("batchSurveyLanguageSupport")
      .timeBased()
      .everyMinutes(interval)
      .create();
}

function deleteTrigger() {
  // Loop over all triggers and delete them
  Logger.log("deleteTrigger called");

  var allTriggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < allTriggers.length; i++) {
    ScriptApp.deleteTrigger(allTriggers[i]);
  }
}

