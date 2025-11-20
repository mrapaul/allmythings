#!/bin/bash
export MACOSX_DEPLOYMENT_TARGET=10.15
export ARCHS=x86_64
flutter test integration_test/image_picker_test.dart -d macos
