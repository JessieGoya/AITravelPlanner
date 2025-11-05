package com.ai.travel.web;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/llm/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> request) {
        try {
            String baseUrl = (String) request.get("baseUrl");
            String apiKey = (String) request.get("apiKey");
            String model = (String) request.getOrDefault("model", "gpt-4o-mini");
            String prompt = (String) request.get("prompt");

            if (baseUrl == null || apiKey == null || prompt == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "缺少必需参数：baseUrl, apiKey, prompt");
                return ResponseEntity.badRequest().body(error);
            }

            // 构建请求 URL
            String url = baseUrl.replaceAll("/$", "") + "/chat/completions";

            // 构建消息列表
            List<Map<String, String>> messages = new ArrayList<>();
            Map<String, String> systemMsg = new HashMap<>();
            systemMsg.put("role", "system");
            systemMsg.put("content", "你是一名专业旅行规划助手，请输出中文结果，并按天列出行程、交通、住宿、景点、餐饮，并估算费用（人民币）。");
            messages.add(systemMsg);
            
            Map<String, String> userMsg = new HashMap<>();
            userMsg.put("role", "user");
            userMsg.put("content", prompt);
            messages.add(userMsg);

            // 构建请求体
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);

            // 设置请求头
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            // 发送请求
            ResponseEntity<Map> response = restTemplate.exchange(
                url, HttpMethod.POST, entity, Map.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> body = response.getBody();
                Object choices = body.get("choices");
                if (choices instanceof List && !((List<?>) choices).isEmpty()) {
                    Map<?, ?> firstChoice = (Map<?, ?>) ((List<?>) choices).get(0);
                    Map<?, ?> message = (Map<?, ?>) firstChoice.get("message");
                    String content = (String) message.get("content");
                    Map<String, String> result = new HashMap<>();
                    result.put("content", content != null ? content : "（无返回内容）");
                    return ResponseEntity.ok(result);
                }
            }

            Map<String, String> error = new HashMap<>();
            error.put("error", "LLM 调用失败：" + response.getStatusCode());
            return ResponseEntity.status(response.getStatusCode()).body(error);

        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "请求处理失败：" + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}

