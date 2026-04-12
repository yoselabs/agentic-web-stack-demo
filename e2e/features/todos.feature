Feature: Todo Management

  Scenario: Empty state shows no todos
    Given I am signed in as "empty-todos@example.com"
    And I navigate to "/todos"
    Then I should see "No todos yet"

  Scenario: Create a todo
    Given I am signed in as "create-todo@example.com"
    And I navigate to "/todos"
    When I fill in "Add a todo..." with "Buy groceries"
    And I click "Add"
    Then I should see "Buy groceries"

  Scenario: Complete a todo
    Given I am signed in as "complete-todo@example.com"
    And I navigate to "/todos"
    And I have a todo "Write tests"
    When I toggle the todo "Write tests"
    Then the todo "Write tests" should be completed

  Scenario: Delete a todo
    Given I am signed in as "delete-todo@example.com"
    And I navigate to "/todos"
    And I have a todo "Old task"
    When I delete the todo "Old task"
    Then I should not see "Old task"

  Scenario: Todos are private to each user
    Given I am signed in as "private-todos@example.com"
    And I navigate to "/todos"
    And I have a todo "My private task"
    When I sign out and sign in as "other-user@example.com"
    And I navigate to "/todos"
    Then I should not see "My private task"
    And I should see "No todos yet"
