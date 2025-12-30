#!/usr/bin/env ruby
# Add user gem directory to load path
gem_user_dir = File.expand_path('~/.gem/ruby/2.6.0/gems')
Dir.glob("#{gem_user_dir}/*/lib").each { |path| $LOAD_PATH.unshift(path) }

require 'xcodeproj'

project_path = 'Runner.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Check if RunnerUITests target already exists - if so, fix its settings
existing_target = project.targets.find { |t| t.name == 'RunnerUITests' }
if existing_target
  puts 'RunnerUITests target already exists, fixing build settings...'
  existing_target.build_configuration_list.build_configurations.each do |config|
    config.build_settings['PRODUCT_NAME'] = 'RunnerUITests'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.homeinventory.allMyThings.RunnerUITests'
    config.build_settings['INFOPLIST_FILE'] = 'RunnerUITests/Info.plist'
    config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
    config.build_settings['DEVELOPMENT_TEAM'] = ''
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks']
    config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
    config.build_settings['TEST_TARGET_NAME'] = 'Runner'
    # UI Tests should NOT set TEST_HOST or BUNDLE_LOADER - they use XCTRunner
    config.build_settings.delete('TEST_HOST')
    config.build_settings.delete('BUNDLE_LOADER')
  end
  project.save
  puts 'Fixed RunnerUITests build settings'
  exit 0
end

# Get the Runner target
runner_target = project.targets.find { |t| t.name == 'Runner' }
unless runner_target
  puts 'Runner target not found'
  exit 1
end

# Create new UI test target
ui_test_target = project.new_target(:ui_test_bundle, 'RunnerUITests', :ios, '13.0')
ui_test_target.add_dependency(runner_target)

# Set product name
ui_test_target.build_configuration_list.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = 'RunnerUITests'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.homeinventory.allMyThings.RunnerUITests'
  config.build_settings['INFOPLIST_FILE'] = 'RunnerUITests/Info.plist'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['DEVELOPMENT_TEAM'] = ''
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks']
  config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
  config.build_settings['TEST_TARGET_NAME'] = 'Runner'
  # UI Tests should NOT set TEST_HOST or BUNDLE_LOADER - they use XCTRunner
  config.build_settings.delete('TEST_HOST')
  config.build_settings.delete('BUNDLE_LOADER')
end

# Create a group for RunnerUITests
ui_test_group = project.main_group.new_group('RunnerUITests', 'RunnerUITests')

# Add RunnerUITests.m file
source_file_ref = ui_test_group.new_file('RunnerUITests.m')
ui_test_target.source_build_phase.add_file_reference(source_file_ref)

# Add Info.plist
plist_file_ref = ui_test_group.new_file('Info.plist')

# Add to Runner scheme for testing
# First, find or create scheme
scheme_path = Xcodeproj::XCScheme.shared_data_dir(project_path) + 'Runner.xcscheme'
if File.exist?(scheme_path)
  scheme = Xcodeproj::XCScheme.new(scheme_path)

  # Add test action for RunnerUITests
  testable = Xcodeproj::XCScheme::TestAction::TestableReference.new(ui_test_target, project)
  testable.parallelizable = false
  testable.skipped = false

  scheme.test_action.add_testable(testable)
  scheme.save!
  puts 'Updated Runner scheme with RunnerUITests'
else
  puts 'Runner scheme not found, will need to configure manually'
end

project.save

puts 'Successfully added RunnerUITests target'
