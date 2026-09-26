plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // Apply AFTER you add google-services.json (otherwise the build fails).
    // id("com.google.gms.google-services")
}

android {
    namespace = "com.sunrisemotel.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sunrisemotel.app"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // Single place to change the website URL. Debug and release both read it.
        buildConfigField("String", "BASE_URL", "\"https://sunrise-motel.vercel.app\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Debug signing keeps GitHub Actions cloud builds working with no secrets.
            // For Play Store, add a signingConfigs block with your keystore.
            signingConfig = signingConfigs.getByName("debug")
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
    // Broadcast push — uncomment AFTER adding google-services.json:
    // implementation("com.google.firebase:firebase-messaging:23.4.0")
}
