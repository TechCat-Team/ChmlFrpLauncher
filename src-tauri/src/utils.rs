// 隐藏用户日志里面的token
pub fn sanitize_log(message: &str, user_token: &str) -> String {
    let mut result = message.to_string();

    result = result.replace(user_token, "***TOKEN***");

    if let Some(dot_pos) = user_token.find('.') {
        let first_part = &user_token[..dot_pos];
        let second_part = &user_token[dot_pos + 1..];

        if first_part.len() >= 6 {
            result = result.replace(first_part, "***");
        }
        if second_part.len() >= 6 {
            result = result.replace(second_part, "***");
        }
    }

    if user_token.len() >= 10 {
        for window_size in (8..=user_token.len()).rev() {
            if window_size <= user_token.len() {
                let substr = &user_token[..window_size];
                if result.contains(substr) && substr.len() >= 8 {
                    result = result.replace(substr, "***");
                }
            }
        }
    }

    result
}
