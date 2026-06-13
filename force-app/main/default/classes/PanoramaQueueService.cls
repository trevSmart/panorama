public with sharing class PanoramaQueueService {
    public class QueueDto {
        public String id;
        public String name;
        public String color;
        public Integer backlog;
        public Integer longest;
        public Integer avg;
        public Integer online;
    }

    public class QueuesResponse {
        public List<QueueDto> queues;
    }

    private static final List<String> PALETTE = new List<String>{
        '#6A5BE8', '#E05641', '#15A06A', '#D9981F', '#A98AFF', '#3B82F6', '#EC4899'
    };

    public static QueuesResponse getQueues() {
        QueuesResponse response = new QueuesResponse();
        response.queues = new List<QueueDto>();

        List<Group> groups = [
            SELECT Id, Name
            FROM Group
            WHERE Type = 'Queue'
            ORDER BY Name
            LIMIT 200
        ];

        Integer colorIdx = 0;
        for (Group g : groups) {
            QueueDto dto = new QueueDto();
            dto.id = g.Id;
            dto.name = g.Name;
            dto.color = PALETTE[Math.mod(colorIdx, PALETTE.size())];
            dto.backlog = 0;
            dto.longest = 0;
            dto.avg = 0;
            dto.online = 0;
            response.queues.add(dto);
            colorIdx++;
        }

        return response;
    }
}
