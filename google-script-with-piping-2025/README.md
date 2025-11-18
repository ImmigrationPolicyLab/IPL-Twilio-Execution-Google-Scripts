# Updated 2025 version

This script provided supports param piping, and it also includes a test file to ensure that different batches sizes are supported. If tweaking the logic it can be helpful to test that the script doesn't fail for unexpected reasons due to the size of the contact list.

If choosing to run tests, it is advised to copy the public google sheet maintained by IPL, as this has data pre populated to run the test. Run the function `runTests` and this will start both test triggers. The tests use a fake url for twilio requests and does not make Twilio requests but instead mimics a success response. The tests look for any off by one errors related the google sheet.