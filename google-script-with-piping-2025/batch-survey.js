/*
Execute "sendSurveyBatch" to just send one batch (good for testing flow)
Execute "startSurveyBatching" to create trigger and send all batch with an interval wait time between

If for some reason the batching terminates in the middle of a run and you need to restart from a point, 
put "nextBatchStart" in the batch column for the row where batching should start (inclusive). Then re-run function.
*/

// Ids / tokens from Twilio
const ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty("ACCOUNT_SID");
const ACCOUNT_TOKEN = PropertiesService.getScriptProperties().getProperty("ACCOUNT_TOKEN");

const flowId = "xxx"

// Set the sheet names
let surveyContactDataSheetName = "contactData";
let surveyResponseSheetName = "executionResponse";

// Use the Twilio number to set the number that will send messages
const fromNumber = "whatsapp:+15555558886"; // ensure this number is formatted with a "+" at the beginning

// Set the batch size (the number of surveys to send in one batch)
// Recommended: 20 - 30 surveys per batch, with 5 minute interval wait time
let batchSize = 1;

// set constant options for sending the request to twilio
const options = {
  "method": "post",
  "headers": {
    "Authorization": "Basic " + Utilities.base64Encode(ACCOUNT_SID + ":" + ACCOUNT_TOKEN)
  }
};

// Set the wait time between batches
// Recommended: 5 minute interval wait time to prevent API throttling in response google sheet
let interval = 1;

const url = "https://studio.twilio.com/v1/Flows/" + flowId + "/Executions";

const startSurveyBatching = (isTest = false, contactDataSheetName = null, responseSheetName = null, batchSizeTest = null) => {
  // For testing always make sure interval is set to 1.
  interval = isTest ? 1 : interval;

  // Trigger batch every [inverval] minute
  Logger.log("startSurveyBatching called");

  // Call batchSurvey to kick off initial batch
  // test out if the trigger will mostly execute quickly
  // sendSurveyBatch();

  // Create trigger to kick off new batch after delayed interval
  const trigger = ScriptApp.newTrigger("sendSurveyBatch")
    .timeBased()
    .everyMinutes(interval)
    .create();

  const triggerId = trigger.getUniqueId();
  setConstantValues(
    triggerId,
    isTest,
    contactDataSheetName,
    responseSheetName,
    batchSizeTest
  );
}

async function sendSurveyBatch(e) {
  try {
    const triggerId = e?.triggerUid;
    const constantData = PropertiesService.getScriptProperties().getProperty(triggerId);
    const { contactDataSheetName, responseSheetName, batchSizeTest, isTest } = JSON.parse(constantData) || {};

    // If the batch is not kicked off as part of a trigger, then default to the sheet names set in the constant file

    // Use the url to access the sheet that needs to be edited
    const spreadSheetDoc = SpreadsheetApp.openByUrl('https://docs.google.com/spreadsheets/d/1lYoDTbws9zxKJl1AuhbC1xG3JhFzCoHGGXm8aDnpGvg/edit?gid=136696754#gid=136696754');

    const contactSheetData = spreadSheetDoc.getSheetByName(
      contactDataSheetName ? contactDataSheetName : surveyContactDataSheetName
    );

    // Execute on the active sheet that is attached to the script
    // let contactSheetData = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    //   contactDataSheetName ? contactDataSheetName : surveyContactDataSheetName
    // );
    
    let responseSheetData = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      responseSheetName ? responseSheetName : surveyResponseSheetName
    );
    batchSize = isTest ? parseInt(batchSizeTest) : batchSize;

    const values = contactSheetData.getDataRange().getValues();
    let batchStartRow = 1;
    let previousBatchRow = null
    let row = 2;

    // Find the batchStartRow, if one exists. Update 
    while (batchStartRow == 1 && row <= values.length) {
      const val = values[row] && values[row][1]
      if (val == "PreviousBatchStart") {
        previousBatchRow = row
      }
      if (val == "NextBatchStart") {
        Logger.log("next batch start found")
        batchStartRow = row;
        break;
      }
      row += 1;
    }

    // Check for an error state where trigger still exists even after all batches have completed. Delete triggers and throw an error.
    // This should not happen. But we'll check to ensure user doesn't recieve duplicate survey messages from Twilio
    if (previousBatchRow && batchStartRow == 1) {
      deleteTrigger();
      throw new Error("Batching appears to be completed but batch start is set back to 1. Terminating execution to prevent duplicate twilio messages being sent.")
    }

    // Iterate through contact numbers and send a post request for each contact number
    for (let r = batchStartRow; r < batchStartRow + batchSize && r < values.length; r++) {
      const toNumber = values[r][0];
      options.payload = getPayloadDataForRequest(r, toNumber, fromNumber, contactSheetData);

      if (!toNumber) {
        continue;
      }

      try {
        const response = isTest ?
          { status: "active", code: 200, sid: "test" } :
          JSON.parse(UrlFetchApp.fetch(url, options));

        responseSheetData.appendRow(
          [new Date(), response.code, response.status, response.sid, response.contact_channel_address, response.url, options.payload.Parameters]
        );
      } catch (error) {
        Logger.log("Error sending request for row " + r + ": " + error);
        const responseData = [new Date(), null, null, null, null, error];
        responseSheetData.appendRow(responseData);
      }
    }

    const isLastBatch = batchStartRow + batchSize >= values.length;
    const totalDataRange = contactSheetData.getDataRange();

    if (isLastBatch && triggerId) {
      deleteTrigger(triggerId);
    }

    if (!isLastBatch) {
      markNextBatchStart(batchStartRow, totalDataRange, contactSheetData);
    }

    markPreviousBatchStart(batchStartRow, totalDataRange, contactSheetData);
  } catch (error) {
    // If a fatal error occurs delete the trigger to prevent retrying 
    Logger.log(error);
    deleteTrigger(e && e.triggerUid);
    throw error;
  }
}

const markNextBatchStart = (batchStartRow, totalDataRange, contactSheetData) => {
  // mark the next batch start if it isn't defined AND it is within range of the table
  const cell = totalDataRange.getCell(batchStartRow + batchSize + 1, 2).getA1Notation();
  contactSheetData.getRange(cell).setValue("NextBatchStart");
}

const markPreviousBatchStart = (batchStartRow, totalDataRange, contactSheetData) => {
  // mark the previousBatchStart if it isn't defined AND it is within range of the table
  const cell = totalDataRange.getCell(batchStartRow + 1, 2).getA1Notation();
  contactSheetData.getRange(cell).setValue("PreviousBatchStart");
}

const getPayloadDataForRequest = (row, toNumber, fromNumber, contactSheetData) => {
  // Get the values for the contact data that will be passed as params in the Twilio request
  const contactDataValuesArr = contactSheetData.getSheetValues(row + 1, 3, 1, -1)[0];
  Logger.log(`values: ${contactDataValuesArr}`);

  /* 
  Get the headers/parameters that should be sent to personalize the twilio message
  Parameter documentation note for the function "getSheetValues": startRow, startColumn, numRows, numColumns
  When numColumns is set to -1 it automatically detects where last column value is and pulls all the headers/parameters up to that point
  In the twilio flow, to access the parameter values, use {{flow.data.[parameter]}} within the flow text
  */
  const contactDataHeaders = contactSheetData.getSheetValues(1, 3, 1, -1)[0]

  const headers = contactDataHeaders;
  const params = {};

  for (let i = 0; i < headers.length; i++) {
    params[headers[i]] = contactDataValuesArr[i];
  }

  return {
    "To": "whatsapp:+" + toNumber,
    "From": fromNumber,
    "Parameters": JSON.stringify(params),
  }
}

function setConstantValues(
  triggerId,
  isTest,
  contactDataSheetName = surveyContactDataSheetName,
  responseSheetName = surveyResponseSheetName,
  batchSizeTest
) {
  const data = {
    isTest,
    contactDataSheetName,
    responseSheetName,
    batchSizeTest
  }

  const stringifiedData = JSON.stringify(data);
  PropertiesService.getScriptProperties().setProperty(triggerId, stringifiedData);
}

function deleteTrigger(triggerUid) {
  if (!triggerUid) {
    return;
  }

  const currentTriggers = ScriptApp.getProjectTriggers();
  const trigger = currentTriggers.find((trigger) => trigger.getUniqueId() === triggerUid)

  ScriptApp.deleteTrigger(trigger);

  // Delete the temporary property that stored the sheet names
  PropertiesService.getScriptProperties().deleteProperty(triggerUid);
}

