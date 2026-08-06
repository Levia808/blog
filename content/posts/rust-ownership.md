---
date: '2025-06-15T10:00:00+08:00'
draft: false
title: 'Rust 所有权模型'
description: '深入理解 ownership 与 borrowing 的设计哲学。'
tags: [rust, 编程]
ShowToc: true
---

## 为什么所有权存在

内存安全与性能往往不可兼得，Rust 通过所有权系统在编译期解决这个问题——没有垃圾回收，也不会悬垂指针。

## 三条规则

1. 每个值都有且只有一个所有者（owner）
2. 值在离开作用域时被自动释放（drop）
3. 同一时刻，要么有一个可变引用，要么有多个不可变引用

```rust
fn main() {
    let s = String::from("hello");
    let s2 = s.clone();       // 深拷贝
    takes_ownership(s);       // s 被移动
    println!("{}", s2);       // s2 仍可用
}

fn takes_ownership(v: String) {
    println!("got: {}", v);
}
```

## 借用与生命周期

引用（borrow）不转移所有权。生命周期标注帮助编译器确认引用不会悬垂。

> 所有权不是限制，而是让编译器替你管理内存的契约。
