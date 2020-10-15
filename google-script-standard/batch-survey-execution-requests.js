function batchSurvey() {
  Logger.log("batchSurvey called");
  var ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty("ACCOUNT_SID");
  var ACCOUNT_TOKEN = PropertiesService.getScriptProperties().getProperty("ACCOUNT_TOKEN");
  
  // FlowId from Twilio Studio Flow
  var flowId = "YOUR_FLOW_SID";
  
  // Set the sheet name 
  var sheetName = "executions";
  
  // Use the Twilio number to set the number that will send messages
  var fromNumber = "YOUR_TWILIO_NUMBER"; // ensure this number is formatted with a "+" at the beginning
  
  // Set the batch size (the number of surveys to send in one batch)
  // Recommended: 20 surveys per batch, with 3 minute interval wait time
  var batchSize = 2;
  
  var options = {
    "method" : "post",
    "headers": {
       "Authorization" : "Basic " + Utilities.base64Encode(ACCOUNT_SID + ":" + ACCOUNT_TOKEN)
    }
  };
  
  var numSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);  
  var totalDataRange = numSheet.getDataRange();
  var values = numSheet.getDataRange().getValues();
  
  var nextBatchStartRow = 1;  
  var row = 1;

  // Find the nextBatchStart, if one exists
  while(nextBatchStartRow == 1 && row < values.length) {
    if(values[row] && values[row][1] == "NextBatchStart") {
      var batchCell = totalDataRange.getCell(row + 1, 2).getA1Notation();
      numSheet.getRange(batchCell).setValue("PreviousBatchStart");
      nextBatchStartRow = row;
    }
    row = row + 1;
  }
    
  // Set the total number of columns
  var numCols = values[0].length;  

  // Iterate through numbers and send a post request for numbers
  for (let r = 0; r <= batchSize; r++) {
    
    // If the row number is more than the total of rows in the table, delete the trigger
    if (nextBatchStartRow + r >= values.length ) {
        deleteTrigger(); 
    } else {
      // If the row number is within the table range, send the survey request and record the response
      var toNumber = values[nextBatchStartRow + r][0];

      options.payload = {
        "To": "+" + toNumber,
        "From": fromNumber,
      }
      var url = "https://studio.twilio.com/v1/Flows/" + flowId + "/Executions";
      var response = JSON.parse(UrlFetchApp.fetch(url,options));

      // The size of the two-dimensional data array must match the size of the range.
      var spreadStart = totalDataRange.getCell(nextBatchStartRow + r + 1, numCols - 4).getA1Notation();
      var spreadEnd = totalDataRange.getCell(nextBatchStartRow + r + 1, numCols).getA1Notation();
      
      var responseData = [new Date(), response.status, response.sid, response.contact_channel_address, response.url]
      var range = numSheet.getRange(spreadStart + ":" + spreadEnd);
      
      range.setValues([responseData]);
    }
  }
  
  // If the end of the batch is within the range of values, mark the nextBatchStart
  if (nextBatchStartRow + batchSize + 1 < values.length) {
    var cell = totalDataRange.getCell(nextBatchStartRow + batchSize + 2, 2).getA1Notation();
    numSheet.getRange(cell).setValue("NextBatchStart");
  } else {
    // If the end of the batch is outside the range of values, cancel the trigger
    deleteTrigger();
  }
}

function startSurveyBatching() {
  // Set the wait time between batches
  // Recommended: 20 surveys per batch, with 3 minute interval wait time
  var interval = 3;
  // Trigger batch every [inverval] minute
  Logger.log("startSurveyBatching called");
  ScriptApp.newTrigger("batchSurvey")
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

