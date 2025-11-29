Feature: Photo Capture and Object Detection
  As a user
  I want to capture photos and detect objects within them
  So that I can build my home inventory with AI assistance

  Background:
    Given the app is launched and initialized
    And the camera permission is granted
    And the API service is available

  Scenario: User captures photo from camera
    When the user navigates to the camera screen
    And the user captures a photo
    Then the photo should be saved to the device
    And the detection results should display
    And the detection should include at least 3 objects

  Scenario: User selects photo from gallery
    Given a photo exists in the device gallery
    When the user navigates to the photo picker
    And the user selects a photo from gallery
    Then the photo should be processed
    And detection results should be available

  Scenario: Detection shows objects with confidence scores
    When the user captures a valid photo
    Then each detected object should have:
      | field            | constraint      |
      | label            | non-empty       |
      | confidence       | >= 0.5          |
      | boundingBox      | valid bounds    |
      | provider         | supported       |

  Scenario: User retakes photo on poor quality
    When the user captures a blurry/dark photo
    Then the app should warn about image quality
    And the user should have option to retake the photo

  Scenario: Ensemble detection combines multiple providers
    When the user captures a clear photo
    Then the detection should include provider results
    And consensus objects should be highlighted
    And alternative labels should be available
