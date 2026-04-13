Feature: File Upload and Download

  Scenario: Empty state shows no files
    Given I am signed in as "empty-files@example.com"
    And I am on the files page
    Then I should see "No files uploaded yet"

  Scenario: Upload a CSV file
    Given I am signed in as "upload-file@example.com"
    And I am on the files page
    When I upload the file "test-data.csv"
    Then I should see "test-data.csv"
    And I should see "Processed"

  Scenario: Preview uploaded CSV data
    Given I am signed in as "preview-file@example.com"
    And I am on the files page
    And I have uploaded "test-data.csv"
    When I click "Preview"
    Then I should see a data table with 3 rows
    And the table should contain "Alice"
    And the table should contain "Bob"
    And the table should contain "Charlie"

  Scenario: Download processed file
    Given I am signed in as "download-file@example.com"
    And I am on the files page
    And I have uploaded "test-data.csv"
    When I download the file "test-data.csv"
    Then the downloaded file should contain "Alice"

  Scenario: Delete an uploaded file
    Given I am signed in as "delete-file@example.com"
    And I am on the files page
    And I have uploaded "test-data.csv"
    When I click the delete button for "test-data.csv"
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"

  Scenario: Reject non-CSV file
    Given I am signed in as "reject-type@example.com"
    And I am on the files page
    When I upload the file "invalid-file.txt"
    Then I should see "Only CSV files are accepted"

  Scenario: Files are private to each user
    Given I am signed in as "private-files@example.com"
    And I am on the files page
    And I have uploaded "test-data.csv"
    When I sign out and sign in as "other-files-user@example.com"
    And I am on the files page
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"
