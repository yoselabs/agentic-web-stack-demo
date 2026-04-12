Feature: Todo Reordering

  Scenario: Reorder todos by dragging
    Given I am signed in as "reorder-todos@example.com"
    And I navigate to "/todos"
    And I have a todo "First task"
    And I have a todo "Second task"
    When I drag "Second task" above "First task"
    Then "Second task" should appear before "First task"
