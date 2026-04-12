Feature: Authentication

  Scenario: Sign up with email and password
    Given I am on the login page
    When I switch to sign up mode
    And I fill in "Name" with "Test User"
    And I fill in "Email" with "signup@example.com"
    And I fill in "Password" with "testpassword123"
    And I submit the form
    Then I should be on the dashboard
    And I should see "Test User"

  Scenario: Sign in with existing account
    Given a user exists with email "signin@example.com" and password "testpassword123"
    And I am on the login page
    When I fill in "Email" with "signin@example.com"
    And I fill in "Password" with "testpassword123"
    And I submit the form
    Then I should be on the dashboard

  Scenario: Sign in with wrong password
    Given a user exists with email "wrongpw@example.com" and password "testpassword123"
    And I am on the login page
    When I fill in "Email" with "wrongpw@example.com"
    And I fill in "Password" with "wrongpassword"
    And I submit the form
    Then I should see an error message

  Scenario: Protected route redirects to login
    Given I am not signed in
    When I navigate to "/dashboard"
    Then I should be on the login page

  Scenario: Sign out
    Given I am signed in as "signout@example.com"
    And I am on the dashboard
    When I click "Sign Out"
    Then I should be on the home page
