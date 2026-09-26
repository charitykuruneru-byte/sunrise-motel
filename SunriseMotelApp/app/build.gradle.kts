plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.sunrisemotel.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sunrisemotel.app" // LOCKED FOREVER — never change, or users get duplicate icons
        minSdk = 21
        targetSdk = 34
        versionCode = 3 // +1 for EVERY release: 1 -> 2 -> 3 …
        versionName = "1.2"
        // Single place to change the website URL. Debug and release both read it.
        buildConfigField("String", "BASE_URL", "\"https://sunrise-motel.vercel.app\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        // Single release identity forever: same keystore + alias = Android shows
        // "Updating…" instead of installing a duplicate icon.
        create("release") {
            storeFile = file("../sunrise-motel-release.jks")
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
    // Broadcast push (google-services.json is in place).
    implementation("com.google.firebase:firebase-messaging:23.4.0")
}
