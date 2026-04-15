"use client";

import { useEffect, useState } from "react";

const testimonials = [
  {
    quote:
      "OpenMind solved our biggest problem: agents forgetting context. Now our AI systems maintain perfect memory across sessions.",
    author: "Sarah Chen",
    role: "Head of AI",
    company: "Bittensor Labs",
    metric: "Perfect recall rate",
  },
  {
    quote:
      "The hybrid retrieval system is incredible. We get both semantic relevance and relational accuracy that our old systems never achieved.",
    author: "Marcus Webb",
    role: "ML Lead",
    company: "Nous Research",
    metric: "98% relevance accuracy",
  },
  {
    quote:
      "Full provenance tracking gives us audit trails we never thought possible. Compliance is no longer a nightmare.",
    author: "Elena Rodriguez",
    role: "Chief Trust Officer",
    company: "SecureAI",
    metric: "100% auditable",
  },
  {
    quote:
      "Workflow checkpointing changed our agent development. We can pause, inspect, and resume without losing state or context.",
    author: "James Liu",
    role: "Founder",
    company: "Agent Stack",
    metric: "Durable workflows",
  },
];

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % testimonials.length);
        setIsAnimating(false);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeTestimonial = testimonials[activeIndex];

  // return (
  //   <section className="relative py-32 lg:py-40 border-t border-foreground/10 lg:pb-14">
  //     <div className="max-w-7xl mx-auto px-6 lg:px-12">
  //       {/* Section Label */}
  //       <div className="flex items-center gap-4 mb-16">
  //         <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
  //           What people say
  //         </span>
  //         <div className="flex-1 h-px bg-foreground/10" />
  //         {/* <span className="font-mono text-xs text-muted-foreground">
  //           {String(activeIndex + 1).padStart(2, "0")} /{" "}
  //           {String(testimonials.length).padStart(2, "0")}
  //         </span> */}
  //       </div>

  //       {/* Main Quote */}
  //       <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
  //         <div className="lg:col-span-8">
  //           <blockquote
  //             className={`transition-all duration-300 ${
  //               isAnimating
  //                 ? "opacity-0 translate-y-4"
  //                 : "opacity-100 translate-y-0"
  //             }`}
  //           >
  //             {/* <p className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-foreground">
  //               "{activeTestimonial.quote}"
  //             </p> */}
  //           </blockquote>

  //           {/* Author */}
  //           {/* <div
  //             className={`mt-12 flex items-center gap-6 transition-all duration-300 delay-100 ${
  //               isAnimating ? "opacity-0" : "opacity-100"
  //             }`}
  //           >
  //             <div className="w-16 h-16 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center">
  //               <span className="font-display text-2xl text-foreground">
  //                 {activeTestimonial.author.charAt(0)}
  //               </span>
  //             </div>
  //             <div>
  //               <p className="text-lg font-medium text-foreground">
  //                 {activeTestimonial.author}
  //               </p>
  //               <p className="text-muted-foreground">
  //                 {activeTestimonial.role}, {activeTestimonial.company}
  //               </p>
  //             </div>
  //           </div> */}
  //         </div>

  //         {/* Metric highlight, key result, and navigation dots commented out */}
  //       </div>

  //       {/* Company Logos Marquee Label */}
  //       <div className="mt-24 pt-12 border-t border-foreground/10">
  //         <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-8 text-center">
  //           Trusted by AI-first organizations
  //         </p>
  //       </div>
  //     </div>

  //     {/* Full-width marquee outside container */}
  //     <div className="w-full">
  //       <div className="flex gap-16 items-center marquee">
  //         {[...Array(2)].map((_, setIdx) => (
  //           <div key={setIdx} className="flex gap-16 items-center shrink-0">
  //             {[
  //               "Bittensor Labs",
  //               "Nous Research",
  //               "SecureAI",
  //               "Agent Stack",
  //               "Frontier AI",
  //               "Neural Systems",
  //               "Cognitive Labs",
  //               "Memory Networks",
  //             ].map((company) => (
  //               <span
  //                 key={`${setIdx}-${company}`}
  //                 className="font-display text-xl md:text-2xl text-foreground/30 whitespace-nowrap hover:text-foreground transition-colors duration-300"
  //               >
  //                 {company}
  //               </span>
  //             ))}
  //           </div>
  //         ))}
  //       </div>
  //     </div>
  //   </section>
  // );
}
