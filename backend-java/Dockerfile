FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Pre-configure Maven mirrors and settings to improve dependency download reliability
COPY maven-settings.xml /root/.m2/settings.xml

COPY pom.xml .
# Avoid go-offline (which is fragile on some networks); optionally warm the cache
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -e -DskipTests -Dmaven.wagon.http.retryHandler.count=3 dependency:resolve || true

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -e -DskipTests -Dmaven.wagon.http.retryHandler.count=3 package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

