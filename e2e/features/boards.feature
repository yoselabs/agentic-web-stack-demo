Feature: Retro Board Management

  Scenario: Create a board
    Given I am signed in as "create-board@example.com"
    And I navigate to "/boards/new"
    When I fill in "Board Title" with "Sprint 42 Retro"
    And I click "Create Board"
    Then I should see "Sprint 42 Retro"

  Scenario: Add cards to a board
    Given I am signed in as "add-cards@example.com"
    And I have a board "Card Test Board"
    When I add a card "Great teamwork" in "Went Well"
    And I add a card "Slow deployments" in "To Improve"
    And I add a card "Fix CI pipeline" in "Action Items"
    Then I should see "Great teamwork"
    And I should see "Slow deployments"
    And I should see "Fix CI pipeline"

  Scenario: Vote on a card
    Given I am signed in as "vote-card@example.com"
    And I have a board "Vote Test Board"
    And I add a card "Good communication" in "Went Well"
    When I vote on card "Good communication"
    Then card "Good communication" should have 1 vote
    When I vote on card "Good communication"
    Then card "Good communication" should have 0 votes

  Scenario: Delete a card
    Given I am signed in as "delete-card@example.com"
    And I have a board "Delete Card Board"
    And I add a card "Remove me" in "To Improve"
    When I delete card "Remove me"
    Then I should not see "Remove me"

  Scenario: Close a board
    Given I am signed in as "close-board@example.com"
    And I have a board "Close Test Board"
    When I click "Close Board"
    Then I should see "Closed"

  Scenario: Cannot interact with a closed board
    Given I am signed in as "closed-interact@example.com"
    And I have a board "Closed Interact Board"
    When I click "Close Board"
    Then I should see "Closed"
    And the add card inputs should not be visible

  Scenario: User isolation — boards are private
    Given I am signed in as "private-boards@example.com"
    And I navigate to "/boards/new"
    When I fill in "Board Title" with "My Private Board"
    And I click "Create Board"
    And I navigate to "/boards"
    Then I should see "My Private Board"
    When I sign out and sign in as "other-boards-user@example.com"
    And I navigate to "/boards"
    Then I should not see "My Private Board"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "owner-direct@example.com"
    And I have a board "Owner Only Board"
    When I sign out and sign in as "intruder-direct@example.com"
    And I navigate to the board "Owner Only Board" by URL
    Then I should see "Board not found"
