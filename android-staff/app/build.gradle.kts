import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// FCM: google-services.json 이 있을 때만 플러그인 적용(로컬 debug 편의). release 필수 검증은 아래 가드에서.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// versionCode/versionName SSOT: android-staff/version.properties (github.run_number 사용 안 함).
// 파일/키 누락, 정수 파싱 실패 시 빌드 즉시 실패.
val versionPropsFile = rootProject.file("version.properties")
if (!versionPropsFile.exists()) {
    throw GradleException("version.properties not found: ${versionPropsFile.absolutePath}")
}
val versionProps = Properties().apply { FileInputStream(versionPropsFile).use { load(it) } }
val appVersionCode = (versionProps.getProperty("VERSION_CODE")
    ?: throw GradleException("VERSION_CODE missing in version.properties"))
    .trim().toIntOrNull()
    ?: throw GradleException("VERSION_CODE must be an integer in version.properties")
val appVersionName = (versionProps.getProperty("VERSION_NAME")
    ?: throw GradleException("VERSION_NAME missing in version.properties")).trim()

android {
    namespace = "com.autoflow.staff"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.autoflow.staff"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    // release 서명: 비밀값은 환경변수에서만 읽는다(파일 하드코딩/커밋 금지).
    // 값이 없으면 여기서 설정하지 않고, release 빌드 시 taskGraph 가드에서 즉시 실패시킨다.
    signingConfigs {
        create("release") {
            val ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
            val ksPass = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            val kAlias = System.getenv("ANDROID_KEY_ALIAS")
            val kPass = System.getenv("ANDROID_KEY_PASSWORD")
            if (!ksPath.isNullOrBlank() && !ksPass.isNullOrBlank() && !kAlias.isNullOrBlank() && !kPass.isNullOrBlank()) {
                storeFile = file(ksPath)
                storePassword = ksPass
                keyAlias = kAlias
                keyPassword = kPass
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isDebuggable = false
            isMinifyEnabled = false        // 기존 동작 유지: 추측으로 shrink/minify 새로 켜지 않음
            isShrinkResources = false
        }
        // debug 는 기존 개발 편의 그대로(debug 서명, secret 불필요).
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

// release 빌드일 때만 signing secret + google-services.json 필수(누락 시 즉시 실패). debug 빌드는 계속 가능.
gradle.taskGraph.whenReady {
    val buildingRelease = allTasks.any { it.name.contains("Release") }
    if (buildingRelease) {
        val required = listOf(
            "ANDROID_KEYSTORE_PATH",
            "ANDROID_KEYSTORE_PASSWORD",
            "ANDROID_KEY_ALIAS",
            "ANDROID_KEY_PASSWORD"
        )
        val missing = required.filter { System.getenv(it).isNullOrBlank() }
        if (missing.isNotEmpty()) {
            throw GradleException("Release signing env missing: $missing — release APK는 고정 키 서명 필수(디버그 키 대체 금지).")
        }
        if (!file("google-services.json").exists()) {
            throw GradleException("google-services.json missing — FCM 필수. release 빌드 중단.")
        }
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.core:core-ktx:1.15.0")
}
