/*
Execute "sendSurveyBatch" to just send one batch (good for testing flow)
Execute "startSurveyBatching" to create trigger and send all batch with an interval wait time between

If for some reason the batching terminates in the middle of a run and you need to restart from a point, 
put "nextBatchStart" in the batch column for the row where batching should start. Then rerun function.
*/

// Ids / tokens from Twilio
const ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty("ACCOUNT_SID");
const ACCOUNT_TOKEN = PropertiesService.getScriptProperties().getProperty("ACCOUNT_TOKEN");

const flowId = "YOUR_FLOW_SID";

// Set the sheet names
const contactDataSheetName = "contactData";
const responseSheetName = "executionResponse";

const contactData = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(contactDataSheetName);
const responseSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(responseSheetName);

// Get the headers/parameters that should be sent to personalize the twilio message
// Parameter documentation note for the function "getSheetValues": startRow, startColumn, numRows, numColumns
// When numColumns is set to -1 it automatically detects where last column value is and pulls all the headers/parameters up to that point
const contactDataHeaders = contactData.getSheetValues(1, 3, 1, -1)[0]

// Use the Twilio number to set the number that will send messages
const fromNumber = "YOUR_TWILIO_NUMBER"; // ensure this number is formatted with a "+" at the beginning

// Set the batch size (the number of surveys to send in one batch)
// Recommended: 20 - 30 surveys per batch, with 5 minute interval wait time
const batchSize = 2;

// set constant options for sending the request to twilio
const options = {
  "method": "post",
  "headers": {
    "Authorization": "Basic " + Utilities.base64Encode(ACCOUNT_SID + ":" + ACCOUNT_TOKEN)
  }
};

async function sendSurveyBatch() {
  const totalDataRange = contactData.getDataRange();
  const values = contactData.getDataRange().getValues();

  let batchStartRow = null;
  let previousBatchRow = null
  let row = 2;

  // Find the batchStartRow, if one exists
  while (batchStartRow == null && row <= values.length) {
    const val = values[row] && values[row][1]
    if (val == "PreviousBatchStart") {
      previousBatchRow = row
    }
    if (val == "NextBatchStart") {
      Logger.log("next batch start found")
      const batchCell = totalDataRange.getCell(row + 1, 2).getA1Notation();
      contactData.getRange(batchCell).setValue("PreviousBatchStart");
      batchStartRow = row;
      break;
    }
    row += 1;
  }

  batchStartRow = batchStartRow || 1;
  const isLastBatch = batchStartRow + batchSize > values.length;

  if (isLastBatch) {
    deleteTrigger();
  }

  // Check for an error state where trigger still exists even after all batches have completed. Delete triggers and throw an error.
  // This should not happen. But we'll check to ensure user doesn't recieve duplicate survey messages from Twilio
  if (previousBatchRow && batchStartRow == 1) {
    deleteTrigger();
    throw new Error("Batching appears to be completed but batch start is set back to 1. Terminating execution to prevent duplicate twilio messages being sent.")
  }

  if (!isLastBatch) {
    markNextBatchStart(batchStartRow, totalDataRange);
  }

  // Iterate through contact numbers and send a post request for each contact number
  for (let r = batchStartRow; r <= batchStartRow + batchSize && r < values.length; r++) {
    const toNumber = values[r][0];

    // Get the headers for the contact data
    const contactDataValues = contactData.getSheetValues(r + 1, 3, 1, -1)[0];

    const options = getPayloadDataForRequest(contactDataValues, toNumber, fromNumber);
    Logger.log({options: options});

    try {
      const url = "https://studio.twilio.com/v1/Flows/" + flowId + "/Executions";
      const response = JSON.parse(UrlFetchApp.fetch(url, options));
      const responseData = [new Date(), response.status, response.sid, response.contact_channel_address, response.url];
      responseSheet.appendRow(responseData);
    } catch (error) {
      Logger.log("Error sending request for row " + r + ": " + error);
      const responseData = [new Date(), null, null, null, null, error];
      responseSheet.appendRow(responseData);
    }
  }
}

const markNextBatchStart = (batchStartRow, totalDataRange) => {
  // mark the next batch start if it isn't defined AND it is within range of the table
  const cell = totalDataRange.getCell(batchStartRow + batchSize + 1, 2).getA1Notation();
  contactData.getRange(cell).setValue("NextBatchStart");
}

const getPayloadDataForRequest = (valueArr, toNumber, fromNumber) => {
  const headers = contactDataHeaders;
  const values = valueArr;
  const params = {};

  for (let i = 0; i < headers.length; i++) {
    params[headers[i]] = values[i];
  }

  return {
    "To": "+" + toNumber,
    "From": fromNumber,
    "Parameters": JSON.stringify(params),
  }
}

const startSurveyBatching = () => {
  // Set the wait time between batches
  // Recommended: 5 minute interval wait time to prevent API throttling in response google sheet
  const interval = 1;
  // Trigger batch every [inverval] minute
  Logger.log("startSurveyBatching called");

  // Call batchSurvey to kick off initial batch
  sendSurveyBatch();

  // Create trigger to kick off new batch after delayed interval
  ScriptApp.newTrigger("batchSurvey")
    .timeBased()
    .everyMinutes(interval)
    .create();
}

function deleteTrigger() {
  // Loop over all triggers and delete them
  Logger.log("deleteTrigger called");
  const allTriggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < allTriggers.length; i++) {
    ScriptApp.deleteTrigger(allTriggers[i]);
  }
}

