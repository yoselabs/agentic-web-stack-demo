Feature: Team Retrospective Boards

  Scenario: Create a board
    Given I am signed in as "create-board@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board title..." with "Sprint 1 Retro"
    And I click "Create Board"
    Then I should see "Sprint 1 Retro"

  Scenario: Add cards to a board
    Given I am signed in as "add-cards@example.com"
    And I have a board "Cards Test Board"
    When I add a card "Great teamwork" in "Went Well"
    And I add a card "Slow deploys" in "To Improve"
    And I add a card "Fix CI pipeline" in "Action Items"
    Then I should see "Great teamwork"
    And I should see "Slow deploys"
    And I should see "Fix CI pipeline"

  Scenario: Vote on a card
    Given I am signed in as "vote-card@example.com"
    And I have a board "Vote Test Board"
    And I add a card "Nice work" in "Went Well"
    When I vote on the card "Nice work"
    Then the card "Nice work" should show 1 vote
    When I vote on the card "Nice work"
    Then the card "Nice work" should show 0 votes

  Scenario: Cannot interact with a closed board
    Given I am signed in as "closed-board@example.com"
    And I have a board "Close Test Board"
    And I add a card "Before close" in "Went Well"
    When I close the board
    Then I should see "Closed"
    And the add card forms should be hidden

  Scenario: Delete a card
    Given I am signed in as "delete-card@example.com"
    And I have a board "Delete Test Board"
    And I add a card "To be deleted" in "To Improve"
    When I delete the card "To be deleted"
    Then I should not see "To be deleted"

  Scenario: Close a board
    Given I am signed in as "close-board@example.com"
    And I have a board "Board To Close"
    When I close the board
    Then I should see "Closed"

  Scenario: User isolation - boards are private
    Given I am signed in as "private-board@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board title..." with "My Private Board"
    And I click "Create Board"
    And I navigate to "/boards"
    Then I should see "My Private Board"
    When I sign out and sign in as "other-board-user@example.com"
    And I navigate to "/boards"
    Then I should not see "My Private Board"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "owner-board@example.com"
    And I have a board "Owner Only Board"
    When I sign out and sign in as "intruder-board@example.com"
    And I navigate to the last board URL
    Then I should see "Board not found"
