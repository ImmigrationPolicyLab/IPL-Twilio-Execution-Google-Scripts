function runTests() {
  runCDEquallyDivides();
  runCDBatchSmaller();
  
  const currentTriggers = ScriptApp.getProjectTriggers();

  // Delay this call to ensure tests have time to run and complete
  Utilities.sleep(60 * 5000);
  cleanUpData(currentTriggers);
}

// Test batches run smoothly if the last batch equals the batch size
function runCDEquallyDivides() {
  startSurveyBatching(true, "cDEquallyDivides", "eREquallyDivides", 3);
}

// Test batches run smoothly if the last batch is smaller than the batch size
function runCDBatchSmaller() {
  startSurveyBatching(true, "cDLastBatchSmaller", "eRLastBatchSmaller", 3);
}

// Test that sending a survey batch manually without triggers also works
function sendSurveyBatch() {
  // Write this test to make sure you can use only this function and it is fine
}

function cleanUpData(currentTriggers) {

  currentTriggers.forEach((triggerId) => {
    PropertiesService.getScriptProperties().deleteProperty(triggerId);
  })
}
