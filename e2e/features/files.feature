Feature: File Upload and Download

  Scenario: Empty state shows no files
    Given I am signed in as "empty-files@example.com"
    And I navigate to "/files"
    Then I should see "No files uploaded yet"

  Scenario: Upload a CSV file
    Given I am signed in as "upload-file@example.com"
    And I navigate to "/files"
    When I upload the file "test-data.csv"
    Then I should see "test-data.csv"
    And I should see "Processed"

  Scenario: Preview uploaded CSV data
    Given I am signed in as "preview-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I click "Preview"
    Then I should see a data table with 3 rows

  Scenario: Download processed file
    Given I am signed in as "download-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    Then I should see "Download"

  Scenario: Delete an uploaded file
    Given I am signed in as "delete-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I click the delete button for "test-data.csv"
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"

  Scenario: Files are private to each user
    Given I am signed in as "private-files@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I sign out and sign in as "other-files-user@example.com"
    And I navigate to "/files"
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"
