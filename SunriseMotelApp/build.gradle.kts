// Top-level Gradle build file — project-wide plugin versions live here.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Firebase sender/receiver — needs google-services.json (see README).
    id("com.google.gms.google-services") version "4.4.2" apply false
}
