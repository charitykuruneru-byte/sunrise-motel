plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sunrisemotel.admin"
    compileSdk = 34

    defaultConfig {
        // A DIFFERENT applicationId on purpose: the manager app installs beside
        // the guest app, with its own icon and its own updates.
        applicationId = "com.sunrisemotel.admin"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // Single place to change the website URL. The manager app opens /admin.
        buildConfigField("String", "BASE_URL", "\"https://sunrise-motel.vercel.app\"")
        // The path appended to BASE_URL — one place to change it.
        buildConfigField("String", "START_PATH", "\"/admin\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        // Same keystore as the guest app: one identity to protect, and updates
        // always replace the old install instead of stacking a second icon.
        // `file(...)` is module-relative (SunriseAdminApp/app/), so this climbs
        // to the repo root and then into SunriseMotelApp/ — the CI restore writes
        // the .jks once, and both projects read it.
        create("release") {
            storeFile = file("../../SunriseMotelApp/sunrise-motel-release.jks")
            storePassword = "Sunrise2026!"
            keyAlias = "sunrise"
            keyPassword = "Sunrise2026!"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.android.material:material:1.12.0")
    // No Firebase here on purpose: the manager app is a wrapper for the signed-in
    // portal, and every alert it needs is already on the notification page inside
    // it. Nothing to configure, nothing to leak.
}