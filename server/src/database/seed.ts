import { prisma } from './client.js';

export async function seedDatabase() {
  try {
    const portfolioCount = await prisma.portfolioProject.count();
    if (portfolioCount === 0) {
      console.log('Seeding initial portfolio projects from knowledge base...');
      await prisma.portfolioProject.createMany({
        data: [
          {
            title: 'Apex Strength Club',
            category: 'Gym',
            description: 'Boutique Athletic Training Facility & Membership Gym website with membership checkout and Mindbody scheduling.',
            technologies: 'Next.js, Tailwind CSS, Stripe, Mindbody API',
            results: '+42% online trial signups in 60 days, 99.8% mobile PageSpeed score',
            liveUrl: 'https://apexstrength.example.com',
            keyFeatures: 'Trial membership funnel, coach roster, real-time class schedule',
          },
          {
            title: 'Osteria Del Sole',
            category: 'Restaurant',
            description: 'Modern Italian Trattoria & Wine Bar with interactive visual menu and reservation booking.',
            technologies: 'React, Vite, OpenTable Embed, Tailwind CSS',
            results: '+65% increase in direct weekday table bookings, reduced phone calls by 70%',
            liveUrl: 'https://osteriadelsole.example.com',
            keyFeatures: 'Mobile-first menu with allergen filters, reservation widget, private dining inquiry',
          },
          {
            title: 'Lumière Aesthetics & Hair Studio',
            category: 'Salon',
            description: 'Luxury Hair Salon & Cosmetic Med-Spa showcasing stylist portfolios and treatment booking.',
            technologies: 'React, Tailwind CSS, Fresha integration',
            results: '+50% online booking rate for high-ticket balayage & aesthetic treatments',
            liveUrl: 'https://lumierehair.example.com',
            keyFeatures: 'High-res transformation gallery, stylist bio cards, seamless Fresha booking link',
          },
          {
            title: 'David Vance Advisory',
            category: 'Coaching',
            description: 'Authority-building personal brand site for executive leadership consultant.',
            technologies: 'Next.js, Tailwind CSS, Calendly VIP embed, ConvertKit',
            results: '3.2x increase in qualified discovery call bookings, zero bounce rate on VSL',
            liveUrl: 'https://davidvance.example.com',
            keyFeatures: 'Video sales letter player, PDF lead magnet delivery, qualification quiz',
          },
          {
            title: 'Vanguard Custom Builders',
            category: 'Local business',
            description: 'Architectural Renovation & Luxury Home Builder site with project estimate calculator.',
            technologies: 'React, Vite, Tailwind CSS, localized schema markup',
            results: 'Generated $1.2M in qualified residential remodeling contracts in 6 months',
            liveUrl: 'https://vanguardbuilders.example.com',
            keyFeatures: 'Interactive before/after slider, estimate request wizard, local zip-code SEO',
          },
          {
            title: 'Velocity Fleet Services',
            category: 'Service business',
            description: 'Commercial Fleet Maintenance & B2B Logistics Support corporate portal.',
            technologies: 'React, Express, Tailwind CSS, corporate intake engine',
            results: 'Secured 3 multi-year municipal contracts via inbound corporate portal requests',
            liveUrl: 'https://velocityfleet.example.com',
            keyFeatures: 'Multi-location coverage map, corporate credit application, SLA guarantee badges',
          },
          {
            title: 'Marcus Chen Creative',
            category: 'Creator',
            description: 'Tech YouTuber & Digital Media Personality media kit and digital storefront.',
            technologies: 'Next.js, Tailwind CSS, LemonSqueezy, Beehiiv API',
            results: '4x increase in direct corporate brand sponsorships without agency middleman fee',
            liveUrl: 'https://marcuschen.example.com',
            keyFeatures: 'Real-time viewer metrics counter, sponsor rate sheet, Notion template store',
          },
          {
            title: 'CloudPulse Analytics',
            category: 'Startup',
            description: 'Early-Stage B2B AI Data Monitoring Platform SaaS landing page.',
            technologies: 'React, Vite, Tailwind CSS, Stripe Billing',
            results: '+85% conversion from landing page visitor to active free trial signup',
            liveUrl: 'https://cloudpulse.example.com',
            keyFeatures: 'Interactive interactive demo sandbox, self-serve signup flow, SOC2 security badge',
          },
        ],
      });
    }

    const learningCount = await prisma.learning.count();
    if (learningCount === 0) {
      console.log('Seeding initial sales & messaging learnings...');
      await prisma.learning.createMany({
        data: [
          {
            learning: 'Restaurant owners often worry that redesigning their website will break their existing OpenTable/Toast POS integration or require re-uploading daily specials manually.',
            type: 'OBJECTION_PATTERN',
            evidence: JSON.stringify([
              'Do we have to switch from Toast? Our staff already knows it.',
              'We cannot spend time updating menus twice.',
            ]),
            confidence: 'HIGH',
            appliesTo: 'Restaurant',
            source: 'CONVERSATION_ANALYSIS',
          },
          {
            learning: 'When gym owners ask "How much for a site?", answering with an open-ended generic price range causes ghosting. Highlighting membership retention metrics and a 2-tier package leads to 3x higher reply rate.',
            type: 'PRICING_SIGNAL',
            evidence: JSON.stringify([
              'Just looking for ballpark costs before wasting time.',
              'Other agencies quoted $15k which is insane for a gym.',
            ]),
            confidence: 'HIGH',
            appliesTo: 'Gym',
            source: 'CONVERSATION_ANALYSIS',
          },
          {
            learning: 'Aesthetic clinics and luxury salons care 80% about visual elegance and mobile photo clarity. Sending a portfolio link to a high-end salon case study immediately builds credibility.',
            type: 'NICHE_BEHAVIOR',
            evidence: JSON.stringify([
              'Our current site looks clunky on iPhone and photos are blurry.',
            ]),
            confidence: 'HIGH',
            appliesTo: 'Salon',
            source: 'CONVERSATION_ANALYSIS',
          },
          {
            learning: 'Personalized messages referencing a specific visual element on their current Instagram bio or website (e.g. broken link, non-mobile friendly menu, missing booking button) get a 48% higher response rate.',
            type: 'SUCCESS_FACTOR',
            evidence: JSON.stringify([
              'Wow thanks for pointing out that the booking button was 404ing on mobile.',
            ]),
            confidence: 'HIGH',
            appliesTo: 'All',
            source: 'USER_CORRECTION',
          },
        ],
      });
    }

    const leadCount = await prisma.lead.count();
    if (leadCount === 0) {
      console.log('Seeding verified demo leads for immediate preview and testing...');
      
      // Lead 1: Qualified Gym Lead
      const lead1 = await prisma.lead.create({
        data: {
          businessName: 'Iron & Oak Fitness Club',
          personName: 'Marcus Miller',
          instagramUsername: 'ironandoak_fit',
          phone: '+1 (555) 234-8901',
          email: 'marcus@ironandoakfit.com',
          location: 'Austin, TX',
          website: 'https://ironandoakfit.com',
          niche: 'Gym',
          source: 'INSTAGRAM',
          sourceConversationId: 'ig_conv_demo_ironandoak',
          conversationSummary: 'Marcus inquired about revamping their 4-year-old WordPress site to enable direct member trial passes and Mindbody class scheduling.',
          intent: 'INTERESTED',
          interestLevel: 'HIGH',
          status: 'QUALIFIED',
          qualification: 'QUALIFIED',
          qualificationReason: 'Established physical fitness club with 450+ members, clear budget allocated, and specific pain point with current clunky WordPress site.',
          offerDiscussed: 'Flagship Web Redesign + Mindbody Class Booking System',
          priceDiscussed: '$3,500 - $5,000 project scope',
          objections: JSON.stringify(['Wants to ensure existing member logins do not break']),
          importantMessages: JSON.stringify([
            'We really need a faster site that lets people book free trial passes on mobile.',
            'What is your typical turnaround time for a gym site?',
          ]),
          followUpNeeded: true,
          followUpReason: 'Send proposal overview and Apex Strength Club case study link by Friday',
          portfolioMatch: 'Gym',
          suggestedNextAction: 'Send personalized outreach with Apex Strength Club case study highlighting trial pass signup lift.',
          confidence: 'HIGH',
          evidence: JSON.stringify([
            {
              claim: 'Interested in booking trials and mobile speed',
              evidence: 'We really need a faster site that lets people book free trial passes on mobile.',
              source: 'Instagram DM',
              confidence: 'high',
            },
          ]),
          notes: 'Marcus mentioned opening a second facility in Q3.',
        },
      });

      // Create conversation for Lead 1
      const conv1 = await prisma.conversation.create({
        data: {
          externalId: 'ig_conv_demo_ironandoak',
          source: 'INSTAGRAM',
          title: 'Iron & Oak Fitness Club (Marcus Miller)',
          participantNames: JSON.stringify(['Marcus Miller', 'D Web Studio']),
          messageCount: 5,
          leadId: lead1.id,
          messages: {
            create: [
              {
                sender: 'ironandoak_fit',
                senderType: 'CLIENT',
                content: 'Hey D Web Studio! Saw your recent work for Apex Strength Club on my feed. Really clean aesthetic.',
                timestamp: new Date(Date.now() - 3600 * 1000 * 48),
              },
              {
                sender: 'dwebstudio',
                senderType: 'USER',
                content: 'Hey Marcus! Appreciate the kind words. Apex was a fun build. How is everything running at Iron & Oak?',
                timestamp: new Date(Date.now() - 3600 * 1000 * 44),
              },
              {
                sender: 'ironandoak_fit',
                senderType: 'CLIENT',
                content: 'Our current site is on WordPress from 2021. It takes forever to load on phones and our Mindbody schedule widget keeps breaking. We really need a faster site that lets people book free trial passes on mobile.',
                timestamp: new Date(Date.now() - 3600 * 1000 * 40),
              },
              {
                sender: 'ironandoak_fit',
                senderType: 'CLIENT',
                content: 'What is your typical turnaround time for a gym site? And ballpark cost?',
                timestamp: new Date(Date.now() - 3600 * 1000 * 39),
              },
              {
                sender: 'dwebstudio',
                senderType: 'USER',
                content: 'Usually 3-4 weeks from kickoff to launch with full Mindbody sync. I can pull together a quick breakdown of how we fixed that exact widget speed issue for Apex if that helps?',
                timestamp: new Date(Date.now() - 3600 * 1000 * 20),
              },
            ],
          },
        },
      });

      // Add outreach draft for Lead 1
      await prisma.outreachDraft.create({
        data: {
          leadId: lead1.id,
          channel: 'INSTAGRAM_DM',
          messageBody: 'Hey Marcus! Put together that quick overview showing how we structured the trial pass funnel for Apex Strength so it loads in 0.8s on mobile without widget glitches: https://dwebstudio.com/case-studies/apex-strength — would love to hear your thoughts when you have 5 mins!',
          personalizationReason: 'References his exact pain point regarding widget loading speed and trial pass conversions, backed by Apex Strength Club case study.',
          evidenceUsed: JSON.stringify(['Mindbody widget breaking on mobile', 'Needs faster site for free trial passes']),
          confidence: 'HIGH',
          status: 'DRAFTED',
        },
      });

      // Lead 2: Restaurant Lead
      const lead2 = await prisma.lead.create({
        data: {
          businessName: 'Trattoria Bella Vista',
          personName: 'Elena Rossi',
          instagramUsername: 'bellavista_trattoria',
          phone: 'UNKNOWN',
          email: 'UNKNOWN',
          location: 'San Diego, CA',
          website: 'https://bellavistatrattoria.com',
          niche: 'Restaurant',
          source: 'INSTAGRAM',
          sourceConversationId: 'ig_conv_demo_bellavista',
          conversationSummary: 'Elena contacted asking if D Web Studio can rebuild their site with a live menu that staff can update from an iPad without PDF downloads.',
          intent: 'POSSIBLY_INTERESTED',
          interestLevel: 'MEDIUM',
          status: 'RESEARCHING',
          qualification: 'QUALIFIED',
          qualificationReason: 'High-end authentic Italian restaurant with 120 seats, active social presence, and frustrated by customers unable to read PDFs on mobile.',
          offerDiscussed: 'Interactive Digital Menu & Reservation Redesign',
          priceDiscussed: 'UNKNOWN',
          objections: JSON.stringify(['Worried menu changes will be too technical for kitchen staff']),
          importantMessages: JSON.stringify([
            'Do people have to download a PDF to see our specials or can it be mobile friendly?',
          ]),
          followUpNeeded: true,
          followUpReason: 'Demonstrate dead-simple menu updating workflow like Osteria Del Sole project',
          portfolioMatch: 'Restaurant',
          suggestedNextAction: 'Share Osteria Del Sole case study emphasizing seamless no-PDF mobile menus.',
          confidence: 'HIGH',
          evidence: JSON.stringify([
            {
              claim: 'Frustrated by PDF menus on mobile',
              evidence: 'Do people have to download a PDF to see our specials or can it be mobile friendly?',
              source: 'Instagram DM',
              confidence: 'high',
            },
          ]),
          notes: 'Owner is very protective of their culinary aesthetic.',
        },
      });

      await prisma.conversation.create({
        data: {
          externalId: 'ig_conv_demo_bellavista',
          source: 'INSTAGRAM',
          title: 'Trattoria Bella Vista (Elena Rossi)',
          participantNames: JSON.stringify(['Elena Rossi', 'D Web Studio']),
          messageCount: 3,
          leadId: lead2.id,
          messages: {
            create: [
              {
                sender: 'bellavista_trattoria',
                senderType: 'CLIENT',
                content: 'Hello, love your aesthetic. Quick question: on the restaurant sites you build, do people have to download a PDF to see our specials or can it be mobile friendly?',
                timestamp: new Date(Date.now() - 3600 * 1000 * 24),
              },
              {
                sender: 'dwebstudio',
                senderType: 'USER',
                content: 'Hi Elena! Zero PDF downloads ever. We build fast, mobile-first visual menus that guests can open instantly, with dietary tags and one-tap reservations.',
                timestamp: new Date(Date.now() - 3600 * 1000 * 18),
              },
              {
                sender: 'bellavista_trattoria',
                senderType: 'CLIENT',
                content: 'That sounds like what we need. Our chef changes specials weekly so it has to be super easy to update.',
                timestamp: new Date(Date.now() - 3600 * 1000 * 12),
              },
            ],
          },
        },
      });

      // Lead 3: Rejected / Not Interested
      await prisma.lead.create({
        data: {
          businessName: 'UNKNOWN',
          personName: 'Jake Tyler',
          instagramUsername: 'jaketyler_dropship',
          location: 'UNKNOWN',
          website: 'UNKNOWN',
          niche: 'UNKNOWN',
          source: 'INSTAGRAM',
          sourceConversationId: 'ig_conv_demo_jake',
          conversationSummary: 'Jake offered a dropshipping collaboration and had no genuine business or need for agency web design.',
          intent: 'NOT_INTERESTED',
          interestLevel: 'NONE',
          status: 'REJECTED',
          qualification: 'DISQUALIFIED',
          qualificationReason: 'Unsolicited dropshipping promotional blast with no legitimate business entity or web design requirements.',
          objections: JSON.stringify(['Not a buyer; solicited us for crypto/dropshipping partnership']),
          followUpNeeded: false,
          portfolioMatch: 'NO_MATCH',
          confidence: 'HIGH',
          evidence: JSON.stringify([
            {
              claim: 'Solicitation spam',
              evidence: 'Yo bro want to promote my telegram signals group on your story?',
              source: 'Instagram DM',
              confidence: 'high',
            },
          ]),
          notes: 'Spam account. No action needed.',
        },
      });

      console.log('Demo database seeded successfully.');
    }
  } catch (err) {
    console.error('Database seed error:', err);
  }
}
