Feature: Inventory Item Management
  As a user
  I want to manage my home inventory items
  So that I can organize and track my belongings

  Background:
    Given the app is initialized with a clean database
    And the user is viewing the inventory screen

  Scenario: User saves detected item to inventory
    Given detection results are available
    When the user taps the "Save Item" button
    And the user configures item labels
    And the user submits the form
    Then the item should be added to inventory
    And the item should appear in the feed
    And the local database should be updated

  Scenario: User edits item labels
    Given an item exists in inventory
    When the user selects the item
    And the user taps the edit button
    And the user modifies the labels
    And the user saves changes
    Then the item should be updated
    And the changes should be persisted

  Scenario: User deletes item from inventory
    Given an item exists in inventory with id "item-123"
    When the user selects the item
    And the user taps the delete button
    And the user confirms deletion
    Then the item should be removed from inventory
    And the database should reflect the change

  Scenario: User views item details
    Given an item exists in inventory
    When the user taps on the item
    Then the detail screen should open
    And the photo should display
    And all labels should be visible
    And the detection metadata should be available

  Scenario: Inventory feed displays items in order
    Given the inventory contains 5 items
    When the user views the feed
    Then items should be displayed in chronological order (newest first)
    And each item should show thumbnail and primary label
    And infinite scroll should be supported
